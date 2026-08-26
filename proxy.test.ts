import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { proxy, proxyWithSessionValidation } from "./proxy";

test("login remains reachable when an opaque stale session cookie exists", async () => {
  const request = new NextRequest("http://localhost/login?next=/resume/documents", {
    headers: { cookie: "sid=stale-session" },
  });

  const response = await proxy(request);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("x-middleware-next"), "1");
});

test("protected pages still redirect guests with no session cookie", async () => {
  const response = await proxy(new NextRequest("http://localhost/resume/documents"));

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "http://localhost/login?next=%2Fresume%2Fdocuments",
  );
});

test("protected pages redirect and expire a stale session cookie", async () => {
  const request = new NextRequest("http://localhost/my/dashboard", {
    headers: { cookie: "sid=stale-session" },
  });

  const response = await proxyWithSessionValidation(request, async () => false);

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "http://localhost/login?next=%2Fmy%2Fdashboard",
  );
  assert.match(response.headers.get("set-cookie") ?? "", /sid=;/);
  assert.match(response.headers.get("set-cookie") ?? "", /Expires=Thu, 01 Jan 1970/);
});

test("protected pages remain reachable with a valid server session", async () => {
  const request = new NextRequest("http://localhost/my/dashboard", {
    headers: { cookie: "sid=valid-session" },
  });

  const response = await proxyWithSessionValidation(request, async (sid) => {
    assert.equal(sid, "valid-session");
    return true;
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
});

test("public pages do not require a session lookup", async () => {
  let validationCalls = 0;

  const response = await proxyWithSessionValidation(
    new NextRequest("http://localhost/resume/about"),
    async () => {
      validationCalls += 1;
      return false;
    },
  );

  assert.equal(response.status, 200);
  assert.equal(validationCalls, 0);
});

test("session infrastructure errors retain sid and use the unavailable route", async () => {
  const request = new NextRequest(
    "http://localhost/my/dashboard?surface=resume",
    { headers: { cookie: "sid=valid-but-unverifiable" } },
  );

  const response = await proxyWithSessionValidation(request, async () => {
    throw new Error("database proxy unavailable");
  });

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "http://localhost/unavailable?next=%2Fmy%2Fdashboard%3Fsurface%3Dresume",
  );
  assert.equal(response.headers.get("set-cookie"), null);
});
