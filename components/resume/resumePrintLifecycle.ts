export type ResumePrintLifecycle = {
  cancel: () => void;
};

type ResumePrintLifecycleAdapter = {
  addAfterPrintListener: (listener: () => void) => void;
  removeAfterPrintListener: (listener: () => void) => void;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (id: number) => void;
  print: () => void;
  setPrinting: (active: boolean) => void;
  onFinished: () => void;
  onError: (error: unknown) => void;
};

export function startResumePrintLifecycle(adapter: ResumePrintLifecycleAdapter): ResumePrintLifecycle {
  let active = true;
  let frameId: number | null = null;

  const finish = (notify: boolean) => {
    if (!active) return;
    active = false;
    if (frameId !== null) {
      adapter.cancelFrame(frameId);
      frameId = null;
    }
    adapter.removeAfterPrintListener(handleAfterPrint);
    adapter.setPrinting(false);
    if (notify) adapter.onFinished();
  };
  const handleAfterPrint = () => finish(true);

  adapter.setPrinting(true);
  adapter.addAfterPrintListener(handleAfterPrint);
  frameId = adapter.requestFrame(() => {
    frameId = null;
    try {
      adapter.print();
    } catch (error) {
      finish(true);
      adapter.onError(error);
    }
  });

  return { cancel: () => finish(false) };
}
