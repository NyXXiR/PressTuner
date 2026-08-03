import { Suspense } from "react";

import PaymentMethodCompleteClient from "./PaymentMethodCompleteClient";

export default function Page() {
  return (
    <Suspense
      fallback={<main className="min-h-[60vh] w-full bg-background" />}
    >
      <PaymentMethodCompleteClient />
    </Suspense>
  );
}
