import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("destructive billing reset stays super-admin only", () => {
  const route = source("app/api/billing/subscription/reset-free/route.ts");
  const myPage = source("app/(dashboard)/my/page.tsx");

  assert.match(route, /requireAdmin/);
  assert.doesNotMatch(route, /requireSessionContext/);
  assert.match(myPage, /const isSuperAdmin =/);
  assert.match(myPage, /if \(!isSuperAdmin\) return/);
  assert.match(myPage, /isSuperAdmin && LEGACY_ACCOUNT_TOOLS_ENABLED/);
});

test("client super-admin visibility uses the server-computed me authorization", () => {
  const meService = source("lib/services/meService.ts");
  const meStore = source("stores/useMeStore.tsx");
  const clientPaths = [
    "components/layout/Header.tsx",
    "app/(dashboard)/my/page.tsx",
    "app/(dashboard)/(public)/pricing/PricingPlansClient.tsx",
    "app/(dashboard)/press/(public)/pricing/PressPricingPlansClient.tsx",
  ];

  assert.match(meService, /isSuperAdminEmail/);
  assert.match(meService, /isSuperAdmin:\s*isSuperAdminEmail\(session\.user\.email\)/);
  assert.match(meStore, /isSuperAdmin:\s*data\.isSuperAdmin === true/);

  for (const path of clientPaths) {
    const client = source(path);
    assert.match(client, /me\?\.isSuperAdmin === true/);
    assert.doesNotMatch(client, /lgh0334@gmail\.com/);
    assert.doesNotMatch(client, /from ["']@\/lib\/auth["']/);
  }
});

test("legacy user listing does not expose emails or allow broad enumeration", () => {
  const route = source("app/api/users/route.ts");
  const service = source("lib/services/userService.ts");

  assert.match(route, /requireTeamContext/);
  assert.match(route, /isAdmin\(role\)/);
  assert.match(service, /q\.length < 2/);
  assert.doesNotMatch(service, /email:\s*true/);
  assert.match(service, /isActive:\s*true/);
});

test("production proxy blocks legacy management APIs as well as pages", () => {
  const proxy = source("proxy.ts");
  const dashboardLayout = source("app/(dashboard)/layout.tsx");
  const quotaRoute = source("app/api/admin/ai-quota/route.ts");

  assert.match(proxy, /isProductionHiddenLegacyApiPath/);
  assert.match(proxy, /pathname === "\/admin\/ai-quota"/);
  assert.match(dashboardLayout, /pathname === "\/admin\/ai-quota"/);
  assert.match(proxy, /pathname === "\/api\/admin\/ai-quota"/);
  assert.match(proxy, /pathname\.startsWith\("\/api\/team"\)/);
  assert.match(proxy, /pathname\.startsWith\("\/api\/admin"\)/);
  assert.match(proxy, /pathname\.startsWith\("\/api\/style-guides"\)/);
  assert.match(proxy, /pathname\.startsWith\("\/api\/guides"\)/);
  assert.match(proxy, /pathname\.startsWith\("\/api\/reviews"\)/);
  assert.match(proxy, /pathname\.startsWith\("\/billing"\)/);
  assert.match(proxy, /\/billing\/:path\*/);
  assert.match(proxy, /\/api\/:path\*/);
  assert.match(proxy, /LEGACY_API_DISABLED/);
  assert.match(quotaRoute, /requireAdmin/);
});

test("billing checkout completes through server-issued checkout intents", () => {
  const store = source("stores/billingCheckoutStore.tsx");
  const directCompleteRoute = source("app/api/portone/payments/complete/route.ts");
  const directPrepareRoute = source("app/api/portone/payments/prepare/route.ts");
  const checkoutIntentRoute = source("app/api/billing/checkout-intents/route.ts");
  const quoteRoute = source("app/api/billing/subscription/quote/route.ts");
  const scheduleRoute = source("app/api/billing/subscription/schedule-downgrade/route.ts");

  assert.match(store, /\/api\/billing\/checkout-intents/);
  assert.match(store, /\/api\/billing\/checkout-intents\/prepare/);
  assert.match(store, /\/api\/billing\/checkout-intents\/complete/);
  assert.doesNotMatch(store, /\/api\/portone\/payments\/prepare/);

  assert.match(directCompleteRoute, /ENABLE_LEGACY_DIRECT_BILLING_COMPLETE/);
  assert.match(directCompleteRoute, /LEGACY_DIRECT_BILLING_COMPLETE_DISABLED/);
  assert.match(directPrepareRoute, /ENABLE_LEGACY_DIRECT_BILLING_PREPARE/);
  assert.match(directPrepareRoute, /LEGACY_DIRECT_BILLING_PREPARE_DISABLED/);
  assert.match(checkoutIntentRoute, /isPlanAvailableForPurchase/);
  assert.match(quoteRoute, /isPlanAvailableForPurchase/);
  assert.match(scheduleRoute, /isPlanAvailableForPurchase/);
  assert.match(directCompleteRoute, /isPlanAvailableForPurchase/);
  assert.match(directPrepareRoute, /isPlanAvailableForPurchase/);
});

test("payment method changes never send raw card data to Presstuner APIs", () => {
  const store = source("stores/paymentMethodStore.tsx");
  const rawCardRoute = source("app/api/portone/billing-keys/issue-inicis/route.ts");
  const prepareRoute = source("app/api/portone/billing-keys/prepare/route.ts");

  assert.doesNotMatch(store, /issue-inicis/);
  assert.doesNotMatch(store, /cardNumber/);
  assert.doesNotMatch(store, /passwordTwoDigits/);
  assert.match(store, /PortOne\.requestIssueBillingKey/);
  assert.match(store, /\/api\/billing\/payment-method\/attach/);

  assert.match(prepareRoute, /payProvider === "kakaopay" \? "EASY_PAY" : "CARD"/);
  assert.match(rawCardRoute, /ENABLE_LEGACY_RAW_CARD_BILLING_KEY_ISSUE/);
  assert.match(rawCardRoute, /LEGACY_RAW_CARD_BILLING_KEY_ISSUE_DISABLED/);
});

test("dev billing sandbox stays env-gated and team-admin gated", () => {
  const proxy = source("proxy.ts");
  const page = source("app/(dashboard)/dev/billing-sandbox/page.tsx");
  const route = source("app/api/dev/billing-sandbox/route.ts");
  const gate = source("lib/devBillingSandbox.ts");
  const service = source("lib/services/billing/devBillingSandboxService.ts");
  const header = source("components/layout/Header.tsx");
  const adminHome = source("app/(dashboard)/admin/page.tsx");
  const adminToolNav = source("app/(dashboard)/admin/AdminToolNav.tsx");
  const dashboardLayout = source("app/(dashboard)/layout.tsx");

  assert.match(gate, /ENABLE_DEV_BILLING_SANDBOX/);
  assert.match(gate, /NODE_ENV !== "production"/);
  assert.match(proxy, /DEV_BILLING_SANDBOX_ENABLED/);
  assert.match(proxy, /DEV_BILLING_SANDBOX_ENABLED && pathname === "\/admin"/);
  assert.match(proxy, /isDisabledDevToolPath/);
  assert.match(proxy, /isDisabledDevToolApiPath/);
  assert.match(proxy, /\/dev\/:path\*/);
  assert.match(page, /assertDevBillingSandboxEnabled/);
  assert.match(page, /requireTeamContext/);
  assert.match(page, /isAdmin\(role\)/);
  assert.match(route, /assertDevBillingSandboxEnabled/);
  assert.match(route, /requireTeamContext/);
  assert.match(route, /isAdmin\(role\)/);
  assert.match(service, /completeWithBillingKey/);
  assert.match(service, /recoverPastDueSubscription/);
  assert.match(service, /createMockPortOneDeps/);
  assert.match(header, /NEXT_PUBLIC_ENABLE_DEV_BILLING_SANDBOX/);
  assert.match(header, /\/dev\/billing-sandbox/);
  assert.match(header, /LEGACY_ADMIN_LINKS_VISIBLE/);
  assert.match(adminHome, /requireAdmin/);
  assert.match(adminHome, /AdminToolNav/);
  assert.match(dashboardLayout, /NEXT_PUBLIC_ENABLE_DEV_BILLING_SANDBOX/);
  assert.match(dashboardLayout, /pathname === "\/admin"/);
  assert.match(adminToolNav, /isDevBillingSandboxEnabled/);
  assert.match(adminToolNav, /LEGACY_ADMIN_TOOLS_ENABLED/);
  assert.match(adminToolNav, /\/dev\/billing-sandbox/);
});
