import assert from "node:assert/strict";
import test from "node:test";

import { startResumePrintLifecycle } from "./resumePrintLifecycle";

type Callback = () => void;

function createHarness(print: () => void = () => undefined) {
  let afterPrint: Callback | null = null;
  let frame: Callback | null = null;
  let printing = false;
  let finished = 0;
  let removed = 0;
  let canceledFrame: number | null = null;
  let printError: unknown;

  const lifecycle = startResumePrintLifecycle({
    addAfterPrintListener: (listener) => { afterPrint = listener; },
    removeAfterPrintListener: () => { removed += 1; afterPrint = null; },
    requestFrame: (callback) => { frame = callback; return 17; },
    cancelFrame: (id) => { canceledFrame = id; frame = null; },
    print,
    setPrinting: (active) => { printing = active; },
    onFinished: () => { finished += 1; },
    onError: (error) => { printError = error; },
  });

  return {
    lifecycle,
    runFrame: () => { const callback = frame; frame = null; callback?.(); },
    fireAfterPrint: () => afterPrint?.(),
    snapshot: () => ({ printing, finished, removed, canceledFrame, printError }),
  };
}

test("an immediately returning print call stays active until afterprint", () => {
  let printCalls = 0;
  const harness = createHarness(() => { printCalls += 1; });

  assert.equal(harness.snapshot().printing, true);
  harness.runFrame();
  assert.equal(printCalls, 1);
  assert.deepEqual(harness.snapshot(), {
    printing: true,
    finished: 0,
    removed: 0,
    canceledFrame: null,
    printError: undefined,
  });

  harness.fireAfterPrint();
  assert.deepEqual(harness.snapshot(), {
    printing: false,
    finished: 1,
    removed: 1,
    canceledFrame: null,
    printError: undefined,
  });
});

test("canceling before the frame cleans up without reporting a completed print", () => {
  const harness = createHarness();

  harness.lifecycle.cancel();

  assert.deepEqual(harness.snapshot(), {
    printing: false,
    finished: 0,
    removed: 1,
    canceledFrame: 17,
    printError: undefined,
  });
  harness.runFrame();
});

test("a synchronous print failure restores the preview and reports the error", () => {
  const failure = new Error("print unavailable");
  const harness = createHarness(() => { throw failure; });

  harness.runFrame();

  assert.deepEqual(harness.snapshot(), {
    printing: false,
    finished: 1,
    removed: 1,
    canceledFrame: null,
    printError: failure,
  });
});
