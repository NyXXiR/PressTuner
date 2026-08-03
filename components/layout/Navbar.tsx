"use client";

import Link from "next/link";
import clsx from "clsx";

interface NavBarProps {
  // ✨ 디자인 모드 선택 (기본값: default)
  variant?: "default" | "glass";
}

export function NavBar({ variant = "default" }: NavBarProps) {
  const isGlass = variant === "glass";

  // --- 스타일 정의 ---

  // 1. 네비게이션 바 컨테이너 스타일
  const navStyle = isGlass
    ? "border-b border-white/5 bg-transparent text-slate-300" // Glass: 투명 배경, 연한 테두리
    : "border-b border-border bg-card text-foreground"; // Default: 카드 배경, 기본 테두리

  // 2. 왼쪽 텍스트 스타일
  const leftTextStyle = isGlass ? "text-slate-500" : "text-muted-foreground";

  // 3. 버튼 공통 스타일 (기본/Glass 분기)
  const buttonBaseStyle =
    "inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs transition-colors";

  const buttonStyle = isGlass
    ? "border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-100" // Glass Button
    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"; // Default Button

  // 4. 점선 버튼(예정) 스타일
  const dashedButtonStyle = isGlass
    ? "border-white/10 text-slate-600 cursor-not-allowed"
    : "border-border text-muted-foreground cursor-not-allowed";

  return (
    <nav
      className={clsx(
        "hidden md:flex items-center justify-between px-6 py-2 transition-colors",
        navStyle
      )}
    >
      <div className={clsx("text-[11px]", leftTextStyle)}>
        {isGlass
          ? "자기소개서 작성 AI - 커리어 튜너"
          : "보도자료 작성 AI - 프레스튜너"}
      </div>

      <div className="flex items-center gap-2">
        {/* 새 보도자료 작성 */}
        <Link href="/press/new" className={clsx(buttonBaseStyle, buttonStyle)}>
          <span>✨</span>
          <span>새 보도자료 작성</span>
        </Link>

        {/* 블로그 글 작성 (예정) */}
        <button
          type="button"
          className={clsx(buttonBaseStyle, "border-dashed", dashedButtonStyle)}
        >
          <span>✏️</span>
          <span>블로그 글 작성 (예정)</span>
        </button>

        {/* 자기소개서 탭 이동 (현재 모드에 따라 강조하거나 숨길 수도 있음) */}
        <Link
          href="/resume/write"
          className={clsx(
            buttonBaseStyle,
            buttonStyle,
            // 자소서 모드일 때는 굳이 또 자소서 탭 버튼이 필요 없다면 숨기거나 스타일 변경 가능
            // 여기서는 강조 스타일 예시:
            isGlass &&
              "bg-violet-500/10 border-violet-500/30 text-violet-200 hover:bg-violet-500/20 hover:text-violet-100"
          )}
        >
          <span>👩‍💻</span>
          <span>자기소개서 AI 탭</span>
        </Link>
      </div>
    </nav>
  );
}
