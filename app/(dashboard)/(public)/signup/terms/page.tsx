import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignupForm } from "./signup-form";

export default async function SignupTermsPage() {
  const cookieStore = await cookies();
  const pendingUserCookie = cookieStore.get("pending_signup_user");

  // 임시 쿠키가 없으면(비정상 접근 or 시간 만료) 로그인으로 튕겨냄
  if (!pendingUserCookie) {
    redirect("/login?error=session_expired");
  }

  let userProfile;
  try {
    userProfile = JSON.parse(pendingUserCookie.value);
  } catch {
    redirect("/login?error=invalid_data");
  }

  return (
    <div className="wongoji-sharp mx-auto w-full max-w-5xl pb-20 pt-8 sm:pt-10">
      <SignupForm email={userProfile.email} />
    </div>
  );
}
