import MobileCheckoutIntentClient from "./MobileCheckoutIntentClient";

export default async function MobileCheckoutIntentPage({
  searchParams,
}: {
  searchParams?: Promise<{ intent?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const intentToken = typeof sp.intent === "string" ? sp.intent : "";

  return <MobileCheckoutIntentClient intentToken={intentToken} />;
}
