"use client";

import { usePathname } from "next/navigation";

import { useRightPanelStore } from "@/stores/rightPanelStore";
import { FloatingRightPanelShell } from "@/components/layout/FloatingRightPanelShell";
import { PressGuideAssistant } from "@/components/layout/PressGuideAssistant";
import PressAssistantBar from "@/components/press/PressAssistantBar";

export function RightPanel() {
  const pathname = usePathname();
  const isOpen = useRightPanelStore((state) => state.isOpen);
  const open = useRightPanelStore((state) => state.open);
  const close = useRightPanelStore((state) => state.close);
  const hydrated = useRightPanelStore((state) => state.hasHydrated);

  const isEditPage = /^\/press\/[^/]+\/edit$/.test(pathname);
  const isBillingFocusPage =
    pathname.startsWith("/billing/checkout") ||
    pathname.startsWith("/billing/payment-method");

  if (!hydrated || isBillingFocusPage) return null;

  return (
    <FloatingRightPanelShell
      isOpen={isOpen}
      onOpen={open}
      onClose={close}
      buttonLabel="보도자료 AI 패널 열기"
      panelLabel="보도자료 AI 패널"
      mobileEnabled={isEditPage}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {isEditPage ? <PressAssistantBar /> : <PressGuideAssistant />}
      </div>
    </FloatingRightPanelShell>
  );
}
