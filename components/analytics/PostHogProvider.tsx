"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import {
  buildPostHogPrivacyConfig,
  registerAcquisitionAttribution,
  type PostHogAcquisitionApi,
} from "@/lib/analytics/acquisition-attribution";
import { captureOpsNativePage } from "@/lib/analytics/opsNative";

type PostHogProviderProps = {
  apiKey: string | null;
  apiHost: string;
  productArea: string;
  children: React.ReactNode;
};

type PostHogGlobal = PostHogAcquisitionApi & {
  __SV?: number;
  _i?: unknown[][];
  init?: (token: string, config: Record<string, unknown>, name?: string) => void;
  capture?: (eventName: string, properties?: Record<string, unknown>) => void;
  toString?: (debug?: number | boolean) => string;
  [key: string]: unknown;
};

type PostHogQueue = Array<unknown> &
  PostHogGlobal & {
    people?: PostHogQueue;
  };

declare global {
  interface Window {
    posthog?: PostHogGlobal;
  }
}

let posthogInitialized = false;

function ensurePostHogStub(apiHost: string) {
  if (typeof window === "undefined") return;
  if (window.posthog?.__SV) return;

  const posthog = (window.posthog ??
    ([] as unknown as PostHogQueue)) as PostHogQueue;

  (function initSnippet(documentRef: Document, posthogRef: PostHogQueue) {
    let methods: string[];
    let index: number;
    let scriptTag: HTMLScriptElement;
    let firstScript: HTMLScriptElement | undefined;

    if (posthogRef.__SV) return;

    window.posthog = posthogRef;
    posthogRef._i = posthogRef._i || [];
    posthogRef.init = function init(token: string, config: Record<string, unknown>, name?: string) {
      function register(target: PostHogQueue, method: string) {
        const parts = method.split(".");
        if (parts.length === 2) {
          target = target[parts[0]] as PostHogQueue;
          method = parts[1];
        }

        target[method] = function captureProxy(...args: unknown[]) {
          target.push([method, ...args]);
        };
      }

      scriptTag = documentRef.createElement("script");
      scriptTag.type = "text/javascript";
      scriptTag.async = true;
      scriptTag.crossOrigin = "anonymous";
      scriptTag.src =
        String(config.api_host ?? apiHost).replace(
          ".i.posthog.com",
          "-assets.i.posthog.com",
        ) + "/static/array.js";

      firstScript = documentRef.getElementsByTagName("script")[0];
      firstScript?.parentNode?.insertBefore(scriptTag, firstScript);

      let instance: PostHogQueue = posthogRef;
      let instanceName = name;

      if (instanceName !== undefined) {
        const scopedInstance =
          (posthogRef[instanceName] as PostHogQueue | undefined) ??
          ([] as unknown as PostHogQueue);
        posthogRef[instanceName] = scopedInstance;
        instance = scopedInstance;
      } else {
        instanceName = "posthog";
      }

      instance.people =
        (instance.people as PostHogQueue | undefined) ??
        ([] as unknown as PostHogQueue);
      instance.toString = function stringify(debug?: number | boolean) {
        let base = "posthog";
        if (instanceName !== "posthog") {
          base += `.${instanceName}`;
        }
        if (!debug) {
          base += " (stub)";
        }
        return base;
      };
      instance.people.toString = function peopleStringify() {
        return `${instance.toString?.(1)}.people (stub)`;
      };

      methods = (
        "capture identify alias people.set people.set_once reset group set_config " +
        "set_person_properties unregister register register_once super properties " +
        "opt_in_capturing opt_out_capturing has_opted_in_capturing " +
        "has_opted_out_capturing clear_opt_in_out_capturing start_session_replay " +
        "stop_session_replay onSessionId"
      ).split(" ");

      for (index = 0; index < methods.length; index += 1) {
        register(instance, methods[index]);
      }

      posthogRef._i = posthogRef._i ?? [];
      posthogRef._i.push([token, config, instanceName]);
    };
    posthogRef.__SV = 1;
  })(document, posthog);
}

export function PostHogProvider({
  apiKey,
  apiHost,
  productArea,
  children,
}: PostHogProviderProps) {
  return (
    <>
      <Suspense fallback={null}>
        <PostHogPageTracker apiKey={apiKey} apiHost={apiHost} productArea={productArea} />
      </Suspense>
      {children}
    </>
  );
}

function PostHogPageTracker({
  apiKey,
  apiHost,
  productArea,
}: Pick<PostHogProviderProps, "apiKey" | "apiHost" | "productArea">) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";

  useEffect(() => {
    // Ops native collection is independent from the optional PostHog adapter.
    captureOpsNativePage(pathname ?? "/");
    if (!apiKey) {
      return;
    }

    if (!posthogInitialized) {
      ensurePostHogStub(apiHost);
      window.posthog?.init?.(apiKey, {
        api_host: apiHost,
        defaults: "2026-01-30",
        ...buildPostHogPrivacyConfig(),
      });
      posthogInitialized = true;
    }

    registerAcquisitionAttribution(window.posthog, {
      href: window.location.href,
      referrer: document.referrer,
    });

    window.posthog?.capture?.("page_viewed", {
      product_area: productArea,
      pathname: pathname ?? "/",
    });
  }, [apiHost, apiKey, pathname, productArea, search]);

  return null;
}
