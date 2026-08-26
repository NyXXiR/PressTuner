import assert from "node:assert/strict";
import test from "node:test";

import { useMeStore } from "./useMeStore";

test("a transient me API failure does not turn an authenticated user into a guest", async () => {
  const originalFetch = globalThis.fetch;
  useMeStore.setState({
    me: { isSuperAdmin: false, userId: "user-1" },
    loading: false,
    error: null,
    authStatus: "authed",
    checked: true,
  });
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ ok: false, message: "database proxy unavailable" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );

  try {
    await useMeStore.getState().fetchMe();

    assert.equal(useMeStore.getState().authStatus, "authed");
    assert.equal(useMeStore.getState().me?.userId, "user-1");
    assert.equal(useMeStore.getState().error, "database proxy unavailable");
  } finally {
    globalThis.fetch = originalFetch;
    useMeStore.setState({
      me: null,
      loading: false,
      error: null,
      authStatus: "unknown",
      checked: false,
    });
  }
});
