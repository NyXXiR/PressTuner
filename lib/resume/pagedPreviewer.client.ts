import "client-only";

export type PagedResumePreviewRun = {
  pageCount: number;
  dispose: () => void;
};

type PagedFlow = { total: number };
type PagedPreviewer = {
  chunker?: { pages?: Array<{ removeListeners?: () => void }> };
  preview: (source: HTMLElement, stylesheets: string[], output: HTMLElement) => Promise<PagedFlow>;
};
type PagedPreviewerConstructor = new () => PagedPreviewer;

declare global {
  interface Window {
    PagedModule?: { Previewer?: PagedPreviewerConstructor };
  }
}

const PAGED_RUNTIME_SOURCE = "/vendor/paged.min.js";
const PAGED_RUNTIME_SELECTOR = 'script[data-presstuner-pagedjs-runtime="true"]';
let pagedRuntimePromise: Promise<PagedPreviewerConstructor> | null = null;

function loadedPreviewer() {
  return window.PagedModule?.Previewer;
}

function loadPagedPreviewer(): Promise<PagedPreviewerConstructor> {
  const loaded = loadedPreviewer();
  if (loaded) return Promise.resolve(loaded);
  if (pagedRuntimePromise) return pagedRuntimePromise;

  const pending = new Promise<PagedPreviewerConstructor>((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(PAGED_RUNTIME_SELECTOR);
    const created = !script;
    if (!script) {
      script = document.createElement("script");
      script.src = PAGED_RUNTIME_SOURCE;
      script.async = true;
      script.dataset.presstunerPagedjsRuntime = "true";
    }

    const cleanup = () => {
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };
    const handleLoad = () => {
      cleanup();
      const Previewer = loadedPreviewer();
      if (Previewer) resolve(Previewer);
      else reject(new Error("PDF 미리보기 런타임을 초기화하지 못했습니다."));
    };
    const handleError = () => {
      cleanup();
      script.remove();
      reject(new Error("PDF 미리보기 런타임을 불러오지 못했습니다."));
    };

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    if (created) document.head.appendChild(script);
  });

  pagedRuntimePromise = pending;
  void pending.catch(() => {
    if (pagedRuntimePromise === pending) pagedRuntimePromise = null;
  });
  return pending;
}

async function waitForImages(root: ParentNode) {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(images.map(async (image) => {
    if (!image.complete) {
      await new Promise<void>((resolve, reject) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => reject(new Error(`이미지를 불러오지 못했습니다: ${image.currentSrc || image.src}`)), { once: true });
      });
    }
    if (!image.naturalWidth || !image.naturalHeight) throw new Error(`손상된 이미지입니다: ${image.currentSrc || image.src}`);
    if (typeof image.decode === "function") await image.decode();
  }));
}

async function waitForAssets(root: ParentNode) {
  await document.fonts.ready;
  await waitForImages(root);
}

function createPaginationStage() {
  const stage = document.createElement("div");
  stage.className = "resume-pdf-pagination-stage";
  stage.setAttribute("aria-hidden", "true");
  document.body.appendChild(stage);
  return stage;
}

export async function createPagedResumePreview(source: HTMLElement, output: HTMLElement): Promise<PagedResumePreviewRun> {
  output.replaceChildren();
  await waitForAssets(source);
  const existingHeadNodes = new Set(document.head.querySelectorAll("style, link[rel='stylesheet']"));
  const stage = createPaginationStage();
  try {
    const Previewer = await loadPagedPreviewer();
    const previewer = new Previewer();
    const flow = await previewer.preview(source, ["/styles/resume-print.css"], stage);
    await waitForAssets(stage);
    previewer.chunker?.pages?.forEach((page) => page.removeListeners?.());
    output.replaceChildren(...Array.from(stage.childNodes));
    stage.remove();
    await waitForAssets(output);
    const pages = Array.from(output.querySelectorAll<HTMLElement>(".pagedjs_page"));
    if (pages.length < 1 || flow.total !== pages.length) {
      throw new Error(`생성된 페이지 수가 일치하지 않습니다 (${flow.total}/${pages.length}).`);
    }
    pages.forEach((page, index) => {
      page.classList.add("resume-pdf-page");
      page.dataset.resumePageNumber = String(index + 1);
      page.setAttribute("aria-label", `${index + 1}페이지`);
    });
    const ownedHeadNodes = Array.from(document.head.querySelectorAll<HTMLElement>("style, link[rel='stylesheet']"))
      .filter((node) => !existingHeadNodes.has(node));
    let disposed = false;
    return {
      pageCount: pages.length,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        output.replaceChildren();
        ownedHeadNodes.forEach((node) => node.remove());
      },
    };
  } catch (error) {
    stage.remove();
    output.replaceChildren();
    Array.from(document.head.querySelectorAll<HTMLElement>("style, link[rel='stylesheet']"))
      .filter((node) => !existingHeadNodes.has(node))
      .forEach((node) => node.remove());
    throw error;
  }
}
