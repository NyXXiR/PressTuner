"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  FilePlus2,
  FileQuestionMark,
  Home,
  Mail,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

type AppErrorStateProps = {
  statusCode: "404" | "500";
  title: string;
  description: string;
  reset?: () => void;
  digest?: string;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function AppErrorState({
  statusCode,
  title,
  description,
  reset,
  digest,
}: AppErrorStateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isResumePath = pathname?.startsWith("/resume");
  const isPressPath = pathname?.startsWith("/press");
  const Icon = statusCode === "404" ? FileQuestionMark : TriangleAlert;
  const homeHref = isResumePath ? "/resume" : isPressPath ? "/press" : "/";
  const writeHref = isResumePath ? "/resume/write" : "/press/new";
  const contactHref = isResumePath
    ? "/resume/contact"
    : isPressPath
      ? "/press/contact"
      : "/contact";

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push(homeHref);
  };

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col">
        <header className="flex h-14 items-center justify-center">
          <Link href={homeHref} className="relative h-9 w-[124px] shrink-0">
            <Image
              src="/favicon/logo_black.png"
              alt="brieFFlow"
              fill
              sizes="124px"
              priority
              className="object-contain object-left logo-light"
            />
            <Image
              src="/favicon/logo_white.png"
              alt="brieFFlow"
              fill
              sizes="124px"
              priority
              className="object-contain object-left logo-dark"
            />
          </Link>
        </header>

        <section className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-2xl text-center">
            <div className="pt-surface p-6 sm:p-9">
              <div
                className={cx(
                  "mx-auto mb-6 inline-flex h-12 w-12 items-center justify-center border",
                  statusCode === "404"
                    ? "border-primary/25 bg-primary/10 text-primary"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300",
                )}
              >
                <Icon className="h-6 w-6" />
              </div>

              <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">
                brieFFlow
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {title}
              </h1>
              <p className="mx-auto mt-4 max-w-xl break-keep text-sm leading-7 text-muted-foreground sm:text-base">
                {description}
              </p>

              {digest ? (
                <p className="mx-auto mt-4 max-w-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  오류 참조값: <span className="font-mono">{digest}</span>
                </p>
              ) : null}

              <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row sm:flex-wrap">
                {reset ? (
                  <button
                    type="button"
                    onClick={reset}
                    className="inline-flex h-11 items-center justify-center gap-2 bg-primary px-5 text-sm font-bold text-primary-foreground shadow-primary/20 transition-colors hover:bg-primary/90"
                  >
                    <RotateCcw className="h-4 w-4" />
                    다시 시도
                  </button>
                ) : (
                  <Link
                    href={homeHref}
                    className="inline-flex h-11 items-center justify-center gap-2 bg-primary px-5 text-sm font-bold text-primary-foreground shadow-primary/20 transition-colors hover:bg-primary/90"
                  >
                    <Home className="h-4 w-4" />
                    홈으로 이동
                  </Link>
                )}

                <Link
                  href={writeHref}
                  className="inline-flex h-11 items-center justify-center gap-2 border border-border bg-background px-5 text-sm font-bold text-foreground transition-colors hover:bg-muted/60"
                >
                  <FilePlus2 className="h-4 w-4" />
                  {isResumePath ? "지원서 작성" : "보도자료 작성"}
                </Link>

                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex h-11 items-center justify-center gap-2 border border-border bg-background px-5 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                  이전 페이지
                </button>
              </div>

              <div className="mx-auto mt-7 max-w-md border-t border-border pt-5">
                <p className="break-keep text-sm leading-6 text-muted-foreground">
                  주소가 맞다면 잠시 후 다시 시도해 주세요. 같은 문제가 반복되면 문의 페이지로 상황을 알려주세요.
                </p>
                <Link
                  href={contactHref}
                  className="mt-4 inline-flex h-10 items-center justify-center gap-2 border border-border bg-background px-4 text-xs font-bold text-foreground transition-colors hover:bg-muted"
                >
                  <Mail className="h-4 w-4" />
                  문의하기
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
