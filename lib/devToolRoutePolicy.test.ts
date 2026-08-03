import assert from "node:assert/strict";
import test from "node:test";

import {
  isDisabledDevToolApiPath,
  isDisabledDevToolPath,
  type DevToolRoutePolicy,
} from "./devToolRoutePolicy";

const productionDisabled: DevToolRoutePolicy = {
  isProduction: true,
  apiPlaygroundEnabled: false,
  billingSandboxEnabled: false,
};

const developmentDisabled: DevToolRoutePolicy = {
  ...productionDisabled,
  isProduction: false,
};

test("production conceals every page in the /dev namespace", () => {
  for (const pathname of ["/dev", "/dev/", "/dev/unknown-tool"]) {
    assert.equal(isDisabledDevToolPath(pathname, productionDisabled), true);
  }
});

test("production conceals every API in the /api/dev namespace", () => {
  for (const pathname of ["/api/dev", "/api/dev/", "/api/dev/unknown-tool"]) {
    assert.equal(isDisabledDevToolApiPath(pathname, productionDisabled), true);
  }
});

test("unrelated paths are never classified as disabled dev tools", () => {
  const pagePaths = ["/demo", "/press", "/unknown", "/developer"];
  const apiPaths = ["/api/health", "/api/unknown", "/api/developer"];

  for (const pathname of pagePaths) {
    assert.equal(isDisabledDevToolPath(pathname, productionDisabled), false);
    assert.equal(isDisabledDevToolApiPath(pathname, productionDisabled), false);
  }

  for (const pathname of apiPaths) {
    assert.equal(isDisabledDevToolPath(pathname, productionDisabled), false);
    assert.equal(isDisabledDevToolApiPath(pathname, productionDisabled), false);
  }
});

test("API playground opt-in permits only its existing page and API routes", () => {
  const policy = {
    ...productionDisabled,
    apiPlaygroundEnabled: true,
  };

  for (const pathname of [
    "/dev/api-playground",
    "/dev/api-playground/example",
    "/dev/api/press-new",
    "/dev/api/press-new/example",
  ]) {
    assert.equal(isDisabledDevToolPath(pathname, policy), false);
  }

  for (const pathname of [
    "/api/dev/api-playground",
    "/api/dev/api-playground/example",
  ]) {
    assert.equal(isDisabledDevToolApiPath(pathname, policy), false);
  }

  assert.equal(isDisabledDevToolPath("/dev/unknown-tool", policy), true);
  assert.equal(isDisabledDevToolPath("/dev/api-playground-extra", policy), true);
  assert.equal(isDisabledDevToolPath("/dev/api/press-newer", policy), true);
  assert.equal(isDisabledDevToolApiPath("/api/dev/unknown-tool", policy), true);
  assert.equal(
    isDisabledDevToolApiPath("/api/dev/api-playground-extra", policy),
    true,
  );
});

test("billing sandbox opt-in permits only its page and API subtrees", () => {
  const policy = {
    ...productionDisabled,
    billingSandboxEnabled: true,
  };

  for (const pathname of [
    "/dev/billing-sandbox",
    "/dev/billing-sandbox/example",
  ]) {
    assert.equal(isDisabledDevToolPath(pathname, policy), false);
  }

  for (const pathname of [
    "/api/dev/billing-sandbox",
    "/api/dev/billing-sandbox/example",
  ]) {
    assert.equal(isDisabledDevToolApiPath(pathname, policy), false);
  }

  assert.equal(isDisabledDevToolPath("/dev/unknown-tool", policy), true);
  assert.equal(isDisabledDevToolPath("/dev/billing-sandbox-tools", policy), true);
  assert.equal(isDisabledDevToolApiPath("/api/dev/unknown-tool", policy), true);
  assert.equal(
    isDisabledDevToolApiPath("/api/dev/billing-sandbox-tools", policy),
    true,
  );
});

test("non-production dev namespaces remain enabled", () => {
  for (const pathname of [
    "/dev",
    "/dev/",
    "/dev/api-playground",
    "/dev/api/press-new",
    "/dev/billing-sandbox",
    "/dev/unknown-tool",
  ]) {
    assert.equal(isDisabledDevToolPath(pathname, developmentDisabled), false);
  }

  for (const pathname of [
    "/api/dev",
    "/api/dev/",
    "/api/dev/api-playground",
    "/api/dev/billing-sandbox",
    "/api/dev/unknown-tool",
  ]) {
    assert.equal(
      isDisabledDevToolApiPath(pathname, developmentDisabled),
      false,
    );
  }
});

test("page and API classifiers never cross namespaces", () => {
  for (const pathname of ["/dev", "/dev/unknown-tool"]) {
    assert.equal(isDisabledDevToolApiPath(pathname, productionDisabled), false);
  }

  for (const pathname of ["/api/dev", "/api/dev/unknown-tool"]) {
    assert.equal(isDisabledDevToolPath(pathname, productionDisabled), false);
  }
});
