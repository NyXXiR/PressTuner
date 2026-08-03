// components/LogoutButton.tsx
"use client";

export default function LogoutButton() {
  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      const isResume = window.location.pathname.startsWith("/resume");
      window.location.href = isResume ? "/resume" : "/";
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="text-xs text-gray-500 underline"
    >
      로그아웃
    </button>
  );
}
