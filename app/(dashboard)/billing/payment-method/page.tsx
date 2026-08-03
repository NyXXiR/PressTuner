import { Suspense } from "react";

import PaymentMethodClient from "./PaymentMethodClient";

export default function Page() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-xl px-4 py-10" />}>
      <PaymentMethodClient />
    </Suspense>
  );
}
