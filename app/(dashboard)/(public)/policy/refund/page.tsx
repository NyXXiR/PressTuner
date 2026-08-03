// app/policy/refund/page.tsx

import {
  PolicyPageContent,
  PolicySection,
} from "@/components/page/PolicyPageContent";

export default function RefundPolicyPage() {
  const effectiveDate = "2025-01-01"; // 필요 시 변경

  return (
    <div className="wongoji-sharp mx-auto w-full max-w-5xl pb-20 pt-8 sm:pt-10">
      <PolicyPageContent
        eyebrow="Policy"
        title="교환/환불/취소 규정"
        effectiveDate={effectiveDate}
        relatedLinks={[
          { href: "/policy/service", label: "서비스 제공기간" },
          { href: "/business", label: "사업자정보" },
        ]}
      >
      <PolicySection title="1. 기본 원칙">
        <p>
          brieFFlow는 디지털 서비스(온라인 이용권/구독 등) 특성상 서비스
          제공이 시작된 이후에는 환불이 제한될 수 있습니다. 다만 서비스 장애
          등 회사 귀책 사유가 있는 경우에는 관련 법령 및 내부 기준에 따라
          환불/조치할 수 있습니다.
        </p>
      </PolicySection>

      <PolicySection title="2. 환불이 가능한 경우(예시)">
        <ul className="list-disc pl-5 space-y-2">
          <li>결제 후 서비스 이용 권한이 정상적으로 부여되지 않는 경우</li>
          <li>
            회사 귀책의 중대한 장애로 서비스 이용이 현저히 불가능한 경우
          </li>
          <li>그 밖에 관련 법령에 따라 환불이 필요한 경우</li>
        </ul>
      </PolicySection>

      <PolicySection title="3. 환불이 제한될 수 있는 경우(예시)">
        <ul className="list-disc pl-5 space-y-2">
          <li>서비스 제공(이용권 활성화 등)이 이미 개시된 경우</li>
          <li>이용자의 귀책 사유로 서비스 이용에 장애가 발생한 경우</li>
          <li>부정 이용(약관 위반, 비정상적 사용 등)이 확인된 경우</li>
        </ul>
      </PolicySection>

      <PolicySection title="4. 취소/해지(구독형 서비스의 경우)">
        <ul className="list-disc pl-5 space-y-2">
          <li>
            구독 해지는 서비스 내 해지 기능 또는 고객센터를 통해 요청할 수
            있습니다.
          </li>
          <li>
            해지 시점/잔여기간 처리(즉시 해지 또는 다음 결제일부터 미결제
            등)는 결제 화면/가격 정책 안내를 따릅니다.
          </li>
        </ul>
        <p className="text-xs">
          ※ 자동결제 사용 여부/해지 처리 방식이 있다면, 실제 운영 방식에 맞게
          문구를 조정해 주세요.
        </p>
      </PolicySection>

      <PolicySection title="5. 환불 절차 및 처리 기간">
        <ul className="list-disc pl-5 space-y-2">
          <li>환불 요청: 고객센터 이메일 또는 문의 채널을 통해 접수</li>
          <li>확인/처리: 접수 후 영업일 기준 가능한 빠르게 확인하여 처리</li>
          <li>
            결제수단에 따라 환불 반영 시점은 결제대행사/카드사 정책에 따를 수
            있습니다.
          </li>
        </ul>
      </PolicySection>

      <PolicySection title="6. 교환">
        <p>
          디지털 서비스 특성상 “교환”은 일반적으로 적용되지 않으며, 필요 시
          회사가 제공하는 플랜 변경/기능 조정 등으로 대체될 수 있습니다.
        </p>
      </PolicySection>

      <PolicySection title="7. 문의처">
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
