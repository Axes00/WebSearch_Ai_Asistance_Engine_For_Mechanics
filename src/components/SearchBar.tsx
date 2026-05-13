"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Controlled client-side search input.
 *
 * The explorer uses it to filter the visible children of the current folder.
 * This is intentionally local (no network round trip) for snappy UX —
 * semantic / AI-backed search is the future-ready extension mentioned in
 * the plan.
 */
export default function SearchBar({
  value,
  onChange,
  placeholderKey = "library.searchPlaceholder",
  autoFocus = false,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholderKey?: string;
  autoFocus?: boolean;
}) {
  const t = useTranslations();
  const [local, setLocal] = useState(value);

  useEffect(() => setLocal(value), [value]);

  // Debounce upward propagation so typing stays smooth on large folders.
  useEffect(() => {
    const id = setTimeout(() => onChange(local), 80);
    return () => clearTimeout(id);
  }, [local, onChange]);

  return (
    <div className="relative">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-steel-400"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 1 0 3.42 9.82l3.63 3.63a.75.75 0 1 0 1.06-1.06l-3.63-3.63A5.5 5.5 0 0 0 9 3.5Zm-4 5.5a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
          clipRule="evenodd"
        />
      </svg>
      <input
        type="search"
        className="input-field pl-11"
        placeholder={t(placeholderKey)}
        value={local}
        autoFocus={autoFocus}
        onChange={(e) => setLocal(e.target.value)}
      />
      {local && (
        <button
          type="button"
          onClick={() => setLocal("")}
          aria-label="clear"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-steel-400 hover:bg-steel-100 hover:text-ink dark:hover:bg-steel-700"
        >
          ✕
        </button>
      )}
    </div>
  );
}
