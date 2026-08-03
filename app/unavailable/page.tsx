import type { Metadata } from "next";
import { AppErrorState } from "@/components/layout/AppErrorState";

export const metadata: Metadata = {
  title: "사용할 수 없는 화면",
  robots: {
    index: false,
    follow: false,
  },
};

export default function UnavailablePage() {
  return (
    <AppErrorState
      statusCode="404"
      title="현재 사용할 수 없는 화면입니다"
      description="이 관리 화면은 개편 중인 기능으로, 현재 공개된 Press 또는 Resume 화면에서 필요한 작업을 진행해 주세요."
    />
  );
}
