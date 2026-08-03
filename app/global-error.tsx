"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Standalone fallback requires plain anchors. */

import { useEffect, type CSSProperties } from "react";

const styles = {
  body: {
    margin: 0,
    minHeight: "100vh",
    background: "#f5f4ef",
    color: "#171717",
    fontFamily:
      'Arial, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
  },
  main: {
    boxSizing: "border-box",
    display: "flex",
    minHeight: "100vh",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
  },
  panel: {
    boxSizing: "border-box",
    width: "100%",
    maxWidth: "680px",
    border: "1px solid #d7d4ca",
    background: "#ffffff",
    padding: "clamp(28px, 6vw, 52px)",
    textAlign: "center",
    boxShadow: "0 18px 50px rgba(23, 23, 23, 0.08)",
  },
  brand: {
    margin: 0,
    color: "#255f50",
    fontSize: "13px",
    fontWeight: 800,
    letterSpacing: "0.2em",
  },
  status: {
    margin: "22px 0 0",
    color: "#a65f13",
    fontSize: "52px",
    fontWeight: 800,
    lineHeight: 1,
  },
  heading: {
    margin: "18px 0 0",
    fontSize: "clamp(26px, 5vw, 38px)",
    lineHeight: 1.25,
  },
  description: {
    maxWidth: "520px",
    margin: "18px auto 0",
    color: "#5b5b56",
    fontSize: "16px",
    lineHeight: 1.75,
    wordBreak: "keep-all",
  },
  digest: {
    boxSizing: "border-box",
    maxWidth: "480px",
    margin: "18px auto 0",
    border: "1px solid #dedbd2",
    background: "#f7f6f2",
    padding: "10px 12px",
    color: "#66635d",
    fontSize: "12px",
    overflowWrap: "anywhere",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: "10px",
    marginTop: "30px",
  },
  primaryAction: {
    minHeight: "44px",
    border: 0,
    background: "#255f50",
    padding: "0 20px",
    color: "#ffffff",
    font: "inherit",
    fontSize: "14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryAction: {
    boxSizing: "border-box",
    display: "inline-flex",
    minHeight: "44px",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #cbc8bf",
    background: "#ffffff",
    padding: "0 20px",
    color: "#292925",
    fontSize: "14px",
    fontWeight: 700,
    textDecoration: "none",
  },
} satisfies Record<string, CSSProperties>;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ko">
      <body style={styles.body}>
        <main style={styles.main}>
          <section style={styles.panel} aria-labelledby="global-error-title">
            <p style={styles.brand}>brieFFlow</p>
            <p style={styles.status}>500</p>
            <h1 id="global-error-title" style={styles.heading}>
              서비스를 불러오지 못했습니다
            </h1>
            <p style={styles.description}>
              일시적인 오류로 화면을 표시하지 못했습니다. 다시 시도해도 같은
              문제가 반복되면 문의 페이지로 상황을 알려주세요.
            </p>

            {error.digest ? (
              <p style={styles.digest}>
                오류 참조값: <code>{error.digest}</code>
              </p>
            ) : null}

            <div style={styles.actions}>
              <button
                type="button"
                onClick={reset}
                style={styles.primaryAction}
              >
                다시 시도
              </button>
              <a href="/" style={styles.secondaryAction}>
                홈으로 이동
              </a>
              <a href="/contact" style={styles.secondaryAction}>
                문의하기
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
