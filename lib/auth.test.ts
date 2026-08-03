import assert from "node:assert/strict";
import test from "node:test";

import { isSuperAdminEmail } from "@/lib/auth";

test("super administrator emails come from environment configuration", () => {
  const previousPlural = process.env.SUPER_ADMIN_EMAILS;
  const previousSingle = process.env.SUPER_ADMIN_EMAIL;
  try {
    process.env.SUPER_ADMIN_EMAILS = " first@example.com, SECOND@example.com ";
    process.env.SUPER_ADMIN_EMAIL = " Third@example.com ";
    assert.equal(isSuperAdminEmail("first@example.com"), true);
    assert.equal(isSuperAdminEmail(" second@EXAMPLE.com "), true);
    assert.equal(isSuperAdminEmail("third@example.com"), true);
    assert.equal(isSuperAdminEmail("unconfigured@example.com"), false);
    assert.equal(isSuperAdminEmail(null), false);
    assert.equal(isSuperAdminEmail(""), false);

    process.env.SUPER_ADMIN_EMAILS = "";
    process.env.SUPER_ADMIN_EMAIL = "";
    assert.equal(isSuperAdminEmail("first@example.com"), false);
  } finally {
    if (typeof previousPlural === "undefined") delete process.env.SUPER_ADMIN_EMAILS;
    else process.env.SUPER_ADMIN_EMAILS = previousPlural;
    if (typeof previousSingle === "undefined") delete process.env.SUPER_ADMIN_EMAIL;
    else process.env.SUPER_ADMIN_EMAIL = previousSingle;
  }
});
