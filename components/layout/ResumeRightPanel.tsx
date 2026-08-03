"use client";

import { usePathname } from "next/navigation";

import { useRightPanelStore } from "@/stores/rightPanelStore";
import { FloatingRightPanelShell } from "@/components/layout/FloatingRightPanelShell";
import { ResumeGuideAssistant } from "@/components/layout/ResumeGuideAssistant";

export function ResumeRightPanel() {
  const pathname = usePathname();
  const isOpen = useRightPanelStore((state) => state.isOpen);
  const open = useRightPanelStore((state) => state.open);
  const close = useRightPanelStore((state) => state.close);
  const hydrated = useRightPanelStore((state) => state.hasHydrated);

  const isWritePage = pathname.startsWith("/resume/write");

  if (!hydrated) return null;
  if (isWritePage) return null;

  return (
    <FloatingRightPanelShell
      isOpen={isOpen}
      onOpen={open}
      onClose={close}
      buttonLabel="이력서 AI 패널 열기"
      panelLabel="이력서 AI 패널"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <ResumeGuideAssistant />
      </div>
    </FloatingRightPanelShell>
  );
}
