"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function CheckoutQrCode({
  value,
  size = 216,
  label = "모바일 결제 QR 코드",
}: {
  value: string;
  size?: number;
  label?: string;
}) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let active = true;

    if (!value.trim()) return;

    QRCode.toDataURL(value, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: size,
      color: {
        dark: "#0f172a",
        light: "#ffffffff",
      },
    })
      .then((nextSrc: string) => {
        if (!active) return;
        setSrc(nextSrc);
      })
      .catch(() => {
        if (!active) return;
        setSrc("");
      });

    return () => {
      active = false;
    };
  }, [size, value]);

  return (
    <div className="relative border border-slate-200 bg-white p-4">
      <div className="bg-[linear-gradient(135deg,#f8fafc_0%,#eef2ff_100%)] p-3">
        <div className="aspect-square overflow-hidden bg-white">
          {src ? (
            <img
              src={src}
              alt={label}
              width={size}
              height={size}
              className="h-full w-full"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-slate-100 text-xs text-slate-500">
              QR 생성 중...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
