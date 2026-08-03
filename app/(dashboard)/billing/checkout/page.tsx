import { Suspense } from "react";

import BillingCheckoutClient from "./BillingCheckoutClient";

export default async function BillingCheckoutPage({
  searchParams,
}: {
  searchParams?: Promise<{ plan?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const planId = typeof sp.plan === "string" ? sp.plan : "";

  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-4xl px-4 py-10" />}>
      <BillingCheckoutClient planId={planId} />
    </Suspense>
  );
}
