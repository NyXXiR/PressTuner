import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function LoginPage() {
  return (
    // useSearchParams를 사용하는 클라이언트 컴포넌트는 반드시 Suspense로 감싸야 합니다.
    <Suspense fallback={<div className="min-h-screen w-full bg-background" />}>
      <LoginClient />
    </Suspense>
  );
}
