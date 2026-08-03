import { ContactPageContent } from "@/components/page/ContactPageContent";

export const metadata = {
  title: "문의하기 | PressTuner",
};

export default function ContactPage() {
  return (
    <div className="wongoji-sharp mx-auto w-full max-w-5xl pb-20 pt-8 sm:pt-10">
      <ContactPageContent
        eyebrow="Support"
        title="문의하기"
        description="불편한 점/버그/기능 요청을 남겨주시면 확인 후 반영할게요."
        noticesHref="/notices"
        noticesLabel="공지사항 보러가기"
      />
    </div>
  );
}
