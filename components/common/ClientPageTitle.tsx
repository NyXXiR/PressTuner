"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const SITE_NAME = "brieFFlow";

// 1. 최상위 경로 (섹션)
const SECTION_MAP: Record<string, string> = {
  my: "내 보도자료",
  team: "팀 보도자료",
  resume: "자기소개서",

  admin: "관리자",
};

// 2. 세부 경로 (동작/페이지) - 요청하신 단어 추가됨
const ACTION_MAP: Record<string, string> = {
  // --- 공통 및 일반 ---
  dashboard: "대시보드",
  notices: "공지사항",
  settings: "설정",
  contact: "문의하기",

  // --- 작성 및 관리 ---
  new: "새 작성",
  edit: "수정",
  manage: "멤버 관리", // 요청: manage -> 멤버 관리
  members: "멤버 목록", // (기존 members 경로가 있다면 유지)

  // --- 보도자료 관련 ---
  articles: "보도자료 목록",
  pending: "승인 대기",
  drafts: "임시보관함",
  published: "배포 완료",
  "style-guide": "스타일 가이드",

  // --- 결제 관련 ---
  billing: "결제 및 구독",

  // --- 자기소개서(Resume) 관련 ---
  bricks: "경험 블록", // 요청: bricks -> 경험 블록
  applications: "지원서", // 요청: applications -> 지원서
  consulting: "AI 컨설팅",
  export: "내보내기",
};

// 3. 완전 일치 예외 처리
const EXACT_MATCHES: Record<string, string> = {
  "/login": "로그인",
  "/signup": "회원가입",
  "/pricing": "요금제 안내",
};

export function ClientPageTitle() {
  const pathname = usePathname();

  useEffect(() => {
    let title = "";

    // 1. 완전 일치 확인
    if (EXACT_MATCHES[pathname]) {
      title = EXACT_MATCHES[pathname];
    }
    // 2. 동적 타이틀 생성
    else {
      title = generateDynamicTitle(pathname);
    }

    // 3. 문서 타이틀 적용
    if (title) {
      document.title = `${title} | ${SITE_NAME}`;
    } else {
      document.title = `${SITE_NAME} | 보도자료 작성 AI와 커리어 문서 초안 도구`;
    }
  }, [pathname]);

  return null;
}

function generateDynamicTitle(path: string): string {
  if (path === "/" || !path) return "";

  const segments = path.split("/").filter(Boolean);

  // 첫 번째 세그먼트 (섹션 확인)
  const rootSegment = segments[0];
  const sectionName = SECTION_MAP[rootSegment];

  // 섹션이 없는 일반 페이지인 경우 (예: /support/contact)
  if (!sectionName) {
    const last = segments[segments.length - 1];
    return ACTION_MAP[last] || formatSegment(last);
  }

  // 섹션 메인 페이지 (예: /team)
  if (segments.length === 1) {
    return `${sectionName} 관리`;
  }

  // --- 세부 페이지 분석 ---
  // ID나 불필요한 경로 제외하고 의미 있는 마지막 단어 추출
  const meaningfulSegments = segments.filter((s) => {
    return !/^\d+$/.test(s) && s.length < 20; // 숫자만 있거나 너무 긴 ID 제외
  });

  const lastSegment = meaningfulSegments[meaningfulSegments.length - 1];

  // 마지막이 섹션명과 같으면 메인으로 취급
  if (lastSegment === rootSegment) return `${sectionName} 관리`;

  // 사전 매핑 확인 or 포맷팅
  const actionName = ACTION_MAP[lastSegment] || formatSegment(lastSegment);

  return `${actionName} - ${sectionName}`;
}

// 매핑되지 않은 영문 경로 포맷팅 (예: my-profile -> My Profile)
function formatSegment(segment: string) {
  if (!segment) return "";
  return segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
