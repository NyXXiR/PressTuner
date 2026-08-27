import "client-only";

export type PagedResumePreviewRun = {
  pageCount: number;
  dispose: () => void;
};

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

export async function createPagedResumePreview(source: HTMLElement, output: HTMLElement): Promise<PagedResumePreviewRun> {
  output.replaceChildren();
  await waitForAssets(source);
  const existingHeadNodes = new Set(document.head.querySelectorAll("style, link[rel='stylesheet']"));
  try {
    const { Previewer } = await import("pagedjs");
    const previewer = new Previewer();
    const flow = await previewer.preview(source, ["/styles/resume-print.css"], output);
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
    output.replaceChildren();
    Array.from(document.head.querySelectorAll<HTMLElement>("style, link[rel='stylesheet']"))
      .filter((node) => !existingHeadNodes.has(node))
      .forEach((node) => node.remove());
    throw error;
  }
}
