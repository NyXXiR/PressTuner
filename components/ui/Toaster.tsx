"use client";

import { useToastStore, AppToast } from "@/stores/toastStore";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function Toaster() {
  const items = useToastStore((s) => s.items);
  const remove = useToastStore((s) => s.remove);

  // 위치별 그룹화
  const topCenterItems = items.filter((i) => i.position === "top-center");
  const bottomRightItems = items.filter((i) => i.position === "bottom-right");

  return (
    <>
      {/* 1. 중앙 상단 (캡슐형) */}
      <div className="fixed top-24 left-1/2 z-[1000] -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
        <AnimatePresence>
          {topCenterItems.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              className="pointer-events-auto"
            >
              <ToastCapsule toast={t} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* 2. 우측 하단 (기본형) */}
      <div className="fixed bottom-4 right-4 z-[1000] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {bottomRightItems.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 20, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 10, scale: 0.95 }}
              className="pointer-events-auto"
            >
              <ToastCard toast={t} onRemove={() => remove(t.id)} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

/** 중앙 상단 캡슐 스타일 */
function ToastCapsule({ toast }: { toast: AppToast }) {
  const isError = toast.variant === "error";
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-6 py-2.5 shadow-2xl font-bold text-white border whitespace-nowrap",
        isError
          ? "bg-amber-500 border-amber-400"
          : "bg-emerald-600 border-emerald-500"
      )}
    >
      {isError ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
      <span className="text-[15px]">{toast.description}</span>
    </div>
  );
}

/** 우측 하단 카드 스타일 (기존 유지) */
function ToastCard({
  toast,
  onRemove,
}: {
  toast: AppToast;
  onRemove: () => void;
}) {
  const tone =
    toast.variant === "success"
      ? "border-emerald-500/20 bg-emerald-500/10"
      : toast.variant === "error"
      ? "border-destructive/30 bg-destructive/10"
      : "border-border bg-card";

  return (
    <div
      className={cn(
        "border shadow-sm backdrop-blur bg-background/70 p-3 flex items-start gap-3",
        tone
      )}
    >
      <div className="flex-1 min-w-0">
        {toast.title && (
          <div className="text-sm font-semibold">{toast.title}</div>
        )}
        <div className="text-sm text-muted-foreground">{toast.description}</div>
      </div>
      <button
        onClick={onRemove}
        className="p-1 hover:bg-muted text-muted-foreground"
      >
        <X size={16} />
      </button>
    </div>
  );
}
