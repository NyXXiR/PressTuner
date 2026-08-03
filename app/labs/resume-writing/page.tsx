import type { Metadata } from "next";

import { ResumeWritingLab } from "./components/ResumeWritingLab";

export const metadata: Metadata = {
  title: "자기소개서 작성 플로우 랩",
  description: "자기소개서 생성, 대화형 첨삭, 완료와 경험 브릭 추출을 테스트하는 독립 화면",
  robots: { index: false, follow: false },
};

export default function ResumeWritingLabPage() {
  return <ResumeWritingLab />;
}
