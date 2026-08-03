import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { resolveGoogleLogin } from "@/lib/services/oauthService";
import { prisma } from "@/lib/prisma";

test("Google email matching links an existing user only when the provider verified it", async () => {
  const suffix = randomUUID();
  const email = `oauth-security-${suffix}@example.com`;
  const user = await prisma.user.create({
    data: { loginId: `oauth-security-${suffix}`, label: "OAuth security", email },
  });
  try {
    const unverified = await resolveGoogleLogin({
      providerAccountId: `google-unverified-${suffix}`,
      email,
      emailVerified: false,
    });
    assert.equal("userId" in unverified, false);
    assert.equal(
      await prisma.oAuthAccount.count({ where: { userId: user.id } }),
      0,
    );

    const verified = await resolveGoogleLogin({
      providerAccountId: `google-verified-${suffix}`,
      email,
      emailVerified: true,
    });
    assert.equal("userId" in verified && verified.userId, user.id);
    assert.equal(
      await prisma.oAuthAccount.count({ where: { userId: user.id } }),
      1,
    );
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
