"use client";

import Script from "next/script";
import { useCallback, useEffect, useId, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (target: string, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export default function TurnstileWidget({
  onToken,
}: {
  onToken: (token: string) => void;
}) {
  const rawId = useId();
  const id = `turnstile-${rawId.replace(/:/g, "")}`;
  const widgetId = useRef<string | null>(null);
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const renderWidget = useCallback(() => {
    if (!sitekey || !window.turnstile || widgetId.current) return;
    widgetId.current = window.turnstile.render(`#${id}`, {
      sitekey,
      callback: (token: string) => onToken(token),
      "expired-callback": () => onToken(""),
      "error-callback": () => onToken(""),
    });
  }, [id, onToken, sitekey]);

  useEffect(() => {
    renderWidget();
    return () => {
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [renderWidget]);

  if (!sitekey) {
    return (
      <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Turnstile is not configured yet.
      </p>
    );
  }

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={renderWidget}
      />
      <div id={id} />
    </>
  );
}
