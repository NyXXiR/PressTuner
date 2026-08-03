import { ContactPageContent } from "@/components/page/ContactPageContent";

export const metadata = {
  title: "문의하기 | brieFFlow",
};

export default function ResumeContactPage() {
  return (
    <div className="wongoji-sharp mx-auto w-full max-w-5xl pb-20">
      <ContactPageContent
        eyebrow="Support"
        title="문의하기"
        description="불편한 점/버그/기능 요청을 남겨주시면 확인 후 반영할게요."
        noticesHref="/resume/notices"
        noticesLabel="공지사항 보러가기"
      />
    </div>
  );
}
