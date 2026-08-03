import { AppErrorState } from "@/components/layout/AppErrorState";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "페이지를 찾을 수 없습니다",
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotFoundPage() {
  return (
    <AppErrorState
      statusCode="404"
      title="페이지를 찾을 수 없습니다"
      description="요청하신 주소에 해당하는 페이지가 없거나 이동된 페이지입니다. 홈으로 돌아가거나 작업을 다시 시작해 주세요."
    />
  );
}
