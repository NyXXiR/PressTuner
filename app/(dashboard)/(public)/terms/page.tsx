// app/terms/page.tsx
import { TERMS_DATA } from "@/lib/constants/policies";
import {
  PolicyPageContent,
  PolicySection,
} from "@/components/page/PolicyPageContent";

export const metadata = { title: "이용약관 | brieFFlow" };

export default function TermsPage() {
  const effectiveDate = "2025-01-01";

  return (
    <div className="wongoji-sharp mx-auto w-full max-w-5xl pb-20 pt-8 sm:pt-10">
      <PolicyPageContent
        eyebrow="Terms"
        title="이용약관"
        effectiveDate={effectiveDate}
        relatedLinks={[
          { href: "/business", label: "사업자정보" },
          { href: "/privacy", label: "개인정보처리방침" },
          { href: "/policy/refund", label: "환불/취소 규정" },
        ]}
      >
      {TERMS_DATA.map((section, idx) => (
        <PolicySection key={idx} title={section.title}>
          <ul className="list-disc pl-5 space-y-2">
            {section.content.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </PolicySection>
      ))}

      <PolicySection title="10. 문의처">
        <div className="space-y-1">
          <div>상호명: 미어캣스튜디오</div>
          <div>대표자: 임규훈</div>
          <div>연락처: 010-2032-0334</div>
          <div>
            이메일:{" "}
            <a className="hover:underline" href="mailto:lgh0334@gmail.com">
              lgh0334@gmail.com
            </a>
          </div>
        </div>
      </PolicySection>
    </PolicyPageContent>
    </div>
  );
}
