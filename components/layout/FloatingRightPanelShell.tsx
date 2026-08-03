"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { Bot, MessageSquare } from "lucide-react";
import clsx from "clsx";

type FloatingRightPanelShellProps = {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  children: ReactNode;
  buttonLabel?: string;
  panelLabel?: string;
  widthClassName?: string;
  mobileEnabled?: boolean;
};

export function FloatingRightPanelShell({
  isOpen,
  onOpen,
  onClose,
  children,
  buttonLabel = "AI Assistant 열기",
  panelLabel = "AI Assistant 패널",
  widthClassName = "w-[min(380px,calc(100vw-2rem))]",
  mobileEnabled = false,
}: FloatingRightPanelShellProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  return (
    <div
      className={clsx(
        "pointer-events-none fixed inset-0 z-[90]",
        mobileEnabled ? "block" : "hidden lg:block",
      )}
    >
      <div
        className={clsx(
          "absolute inset-0 transition-all duration-300",
          isOpen
            ? "pointer-events-auto bg-black/10 backdrop-blur-[2px]"
            : "bg-transparent",
        )}
        onClick={onClose}
        aria-hidden={!isOpen}
      />

      <aside
        aria-label={panelLabel}
        className={clsx(
          "pointer-events-auto absolute bottom-20 right-4 top-20 overflow-hidden border border-border bg-card/95 shadow-2xl backdrop-blur-xl lg:bottom-6 lg:right-6 lg:top-24",
          "transition-all duration-300 ease-out",
          widthClassName,
          isOpen
            ? "translate-x-0 opacity-100"
            : "translate-x-[calc(100%+2rem)] opacity-0",
        )}
      >
        <div className="flex h-full min-h-0 flex-col">{children}</div>
      </aside>

      <button
        type="button"
        onClick={onOpen}
        aria-label={buttonLabel}
        className={clsx(
          "pointer-events-auto absolute bottom-20 right-4 inline-flex h-14 w-14 items-center justify-center border border-border text-primary-foreground shadow-2xl transition-all duration-300 lg:bottom-6 lg:right-6 lg:h-16 lg:w-16",
          "bg-primary hover:scale-[1.03] hover:bg-primary/90 active:scale-[0.98]",
          isOpen && "translate-y-3 opacity-0 pointer-events-none",
        )}
      >
        <div className="relative">
          <Bot className="h-6 w-6" />
          <MessageSquare className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-background text-primary" />
        </div>
      </button>
    </div>
  );
}
