// src/config/billing/options.ts
export type PayProvider = "inicis" | "kakaopay";

export function isPayProvider(v: unknown): v is PayProvider {
  return v === "inicis" || v === "kakaopay";
}

export const PAY_PROVIDER_OPTIONS: Array<{
  id: PayProvider;
  label: string;
  description: string;
  enabled: boolean;
}> = [
  {
    id: "kakaopay",
    label: "카카오페이",
    description: "간편 결제 지원",
    enabled: true,
  },
  {
    id: "inicis",
    label: "카드 결제 (이니시스)",
    description: "모바일에서 카드 등록 후 자동결제",
    enabled: true,
  },
];
