"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/lib/routing";
import clsx from "clsx";

/**
 * @param surface
 * - `hero`: dark translucent panel over the homepage image (inactive tab = light gray text).
 * - `header`: light sticky nav — inactive tabs must stay visible on white/light gray.
 *
 * Previously only `hero` styling existed site-wide; on inner pages inactive "EL"/"EN" used
 * `text-white/80` over a nearly white header, so switching away from EN looked impossible.
 */
export default function LanguageSwitcher({
  surface = "hero",
}: {
  surface?: "hero" | "header";
}) {
  const t = useTranslations("common.languageSwitcher");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const setLocale = (next: "el" | "en") => {
    if (next === locale) return;
    // Keep ?ai= etc. without useSearchParams() (avoids Suspense requirement on static prerender).
    const qs =
      typeof window !== "undefined" ? window.location.search : "";
    const dest = qs ? `${pathname}${qs}` : pathname;
    router.replace(dest, { locale: next });
  };

  const isHeader = surface === "header";

  return (
    <div
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-1 py-1 text-sm backdrop-blur-md",
        isHeader
          ? "border-steel-300/70 bg-white/90 shadow-sm dark:border-steel-600 dark:bg-ink-soft/90"
          : "border-white/20 bg-white/10 dark:border-white/10"
      )}
      role="group"
      aria-label={t("label")}
    >
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={clsx(
          "rounded-full px-3 py-1 font-semibold transition",
          locale === "en"
            ? clsx(
                "shadow-card",
                isHeader
                  ? "bg-deepblue text-white"
                  : "bg-white text-ink shadow-card"
              )
            : isHeader
              ? "text-steel-600 hover:bg-steel-100 hover:text-ink dark:text-steel-300 dark:hover:bg-white/10 dark:hover:text-paper"
              : "text-white/80 hover:text-white"
        )}
        aria-pressed={locale === "en"}
      >
        {t("en")}
      </button>
      <span
        className={clsx(isHeader ? "text-steel-400 dark:text-steel-500" : "text-white/40")}
      >
        |
      </span>
      <button
        type="button"
        onClick={() => setLocale("el")}
        className={clsx(
          "rounded-full px-3 py-1 font-semibold transition",
          locale === "el"
            ? clsx(
                "shadow-card",
                isHeader
                  ? "bg-deepblue text-white"
                  : "bg-white text-ink shadow-card"
              )
            : isHeader
              ? "text-steel-600 hover:bg-steel-100 hover:text-ink dark:text-steel-300 dark:hover:bg-white/10 dark:hover:text-paper"
              : "text-white/80 hover:text-white"
        )}
        aria-pressed={locale === "el"}
      >
        {t("el")}
      </button>
    </div>
  );
}
