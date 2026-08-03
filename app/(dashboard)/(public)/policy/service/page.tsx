// app/policy/service/page.tsx

import {
  PolicyPageContent,
  PolicySection,
} from "@/components/page/PolicyPageContent";

export default function ServicePolicyPage() {
  const effectiveDate = "2025-01-01"; // 필요 시 변경

  return (
    <div className="wongoji-sharp mx-auto w-full max-w-5xl pb-20 pt-8 sm:pt-10">
      <PolicyPageContent
        eyebrow="Policy"
        title="서비스 제공기간(배송기간)"
        effectiveDate={effectiveDate}
        relatedLinks={[
          { href: "/policy/refund", label: "교환/환불/취소 규정" },
          { href: "/business", label: "사업자정보" },
        ]}
      >
      <PolicySection title="1. 서비스 제공 방식">
        <p>
          brieFFlow는 온라인 기반 디지털 서비스로, 결제 완료 후 서비스 이용
          권한이 부여되는 방식으로 제공됩니다.
        </p>
      </PolicySection>

      <PolicySection title="2. 제공 시점">
        <ul className="list-disc pl-5 space-y-2">
          <li>
            결제(승인) 완료 후 즉시 또는 수 분 이내 이용 권한이 활성화됩니다.
          </li>
          <li>
            시스템 장애 등으로 지연되는 경우 고객센터로 문의하시면 확인 후
            조치합니다.
          </li>
        </ul>
      </PolicySection>

      <PolicySection title="3. 제공 기간">
        <ul className="list-disc pl-5 space-y-2">
          <li>
            무료 기능: 회사가 정한 범위 내에서 제공되며, 정책에 따라 변경될 수
            있습니다.
          </li>
          <li>
            유료 기능: 결제 시 안내된 이용 기간(예: 월/연 단위 구독 기간) 동안
            제공됩니다.
          </li>
        </ul>
        <p className="text-xs">
          ※ 실제 구독/결제 주기(월/연, 자동결제 여부)는 서비스 내 “가격
          정책/결제 화면”의 안내를 따릅니다.
        </p>
      </PolicySection>

      <PolicySection title="4. 문의처">
        <div className="space-y-1">
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
