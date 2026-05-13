"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { prettyDisplayName } from "@/lib/format";

export type ViewerSibling = {
  id: string;
  name: string;
  href: string;
};

/**
 * Prev/next navigation between sibling files in the same folder.
 *
 * Keyboard shortcuts: `←` = previous, `→` = next. We skip the shortcut
 * when an editable control has focus (search inputs, textareas) to avoid
 * hijacking text cursor navigation.
 */
export default function ViewerNav({
  prev,
  next,
}: {
  prev: ViewerSibling | null;
  next: ViewerSibling | null;
}) {
  const t = useTranslations("viewer");
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft" && prev) {
        e.preventDefault();
        router.push(prev.href);
      }
      if (e.key === "ArrowRight" && next) {
        e.preventDefault();
        router.push(next.href);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, router]);

  return (
    <div className="flex items-center gap-2">
      <NavButton
        sibling={prev}
        label={t("prev")}
        ariaLabel={t("prevAria")}
        direction="prev"
      />
      <NavButton
        sibling={next}
        label={t("next")}
        ariaLabel={t("nextAria")}
        direction="next"
      />
    </div>
  );
}

function NavButton({
  sibling,
  label,
  ariaLabel,
  direction,
}: {
  sibling: ViewerSibling | null;
  label: string;
  ariaLabel: string;
  direction: "prev" | "next";
}) {
  const icon = direction === "prev" ? "‹" : "›";
  const className =
    "inline-flex h-10 items-center gap-2 rounded-lg border border-steel-200 bg-white px-3 text-sm font-medium text-ink transition hover:border-cyan-accent hover:text-cyan-accent disabled:pointer-events-none disabled:opacity-40 dark:border-steel-700 dark:bg-steel-900 dark:text-paper";

  if (!sibling) {
    return (
      <button type="button" disabled className={className} aria-label={ariaLabel}>
        {direction === "prev" && <span aria-hidden>{icon}</span>}
        <span>{label}</span>
        {direction === "next" && <span aria-hidden>{icon}</span>}
      </button>
    );
  }

  const tooltip = prettyDisplayName(sibling.name, "file");
  return (
    <Link
      href={sibling.href}
      className={className}
      aria-label={`${ariaLabel}: ${tooltip}`}
      title={tooltip}
    >
      {direction === "prev" && <span aria-hidden>{icon}</span>}
      <span>{label}</span>
      {direction === "next" && <span aria-hidden>{icon}</span>}
    </Link>
  );
}
