"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Client-side .docx preview using mammoth.js.
 *
 * Mammoth converts a .docx blob to clean HTML in the browser, so there's
 * zero server work and we keep the engineering aesthetic. We scope the
 * generated markup into an <article className="docx-body"> so global
 * styles in globals.css can theme it.
 *
 * Highlights (AI or find-in-document) are added by the parent via the
 * `highlightTerms` prop; matches are wrapped in <mark> tags with a scroll
 * into the first match.
 */
export default function DocxViewer({
  streamHref,
  title,
  highlightTerms,
  onReady,
}: {
  streamHref: string;
  title: string;
  highlightTerms?: string[];
  onReady?: (container: HTMLDivElement) => void;
}) {
  const t = useTranslations("viewer");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      setState("loading");
      try {
        const res = await fetch(streamHref);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        // Dynamic import keeps mammoth out of the initial bundle.
        const mammoth = await import("mammoth/mammoth.browser");
        const result = await mammoth.convertToHtml({ arrayBuffer: buf });
        if (cancelled) return;
        if (containerRef.current) {
          containerRef.current.innerHTML = result.value;
          if (highlightTerms && highlightTerms.length > 0) {
            highlightInNode(containerRef.current, highlightTerms);
          }
          onReady?.(containerRef.current);
        }
        setState("ready");
      } catch (err) {
        if (!cancelled) {
          setErrorMsg((err as Error).message);
          setState("error");
        }
      }
    }
    void render();
    return () => {
      cancelled = true;
    };
    // We intentionally only re-run when the src changes; highlightTerms are
    // re-applied by a separate effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamHref]);

  // Re-apply highlights when the term list changes without re-fetching.
  useEffect(() => {
    if (state !== "ready" || !containerRef.current) return;
    // Strip previous <mark> wrappers before re-applying.
    const marks = containerRef.current.querySelectorAll("mark[data-ai]");
    marks.forEach((m) => {
      const parent = m.parentNode;
      if (!parent) return;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parent.normalize();
    });
    if (highlightTerms && highlightTerms.length > 0) {
      highlightInNode(containerRef.current, highlightTerms);
    }
  }, [highlightTerms, state]);

  return (
    <div className="card overflow-hidden">
      <div className="max-h-[84vh] min-h-[72vh] overflow-y-auto overflow-x-hidden bg-steel-100/70 p-3 dark:bg-ink/70 sm:p-4 md:p-8">
        {state === "loading" && (
          <p className="text-sm text-steel-500 dark:text-steel-300">
            {t("loadingPreview")}
          </p>
        )}
        {state === "error" && (
          <div>
            <p className="text-sm font-semibold text-ink dark:text-paper">
              {t("previewFailed")}
            </p>
            {errorMsg && (
              <p className="mt-1 text-xs text-steel-500 dark:text-steel-300">
                {errorMsg}
              </p>
            )}
          </div>
        )}
        <article
          ref={containerRef}
          aria-label={title}
          className="docx-body prose mx-auto w-full max-w-[58rem] rounded-sm border border-steel-200 bg-white px-4 py-8 shadow-card dark:border-steel-700 dark:bg-paper dark:text-ink sm:px-8 md:px-14 md:py-14"
          style={{ display: state === "ready" ? "block" : "none" }}
        />
      </div>
    </div>
  );
}

/**
 * Walk the text nodes of `root` and wrap every occurrence of any term in
 * `terms` with a <mark data-ai> element. Terms shorter than 3 chars are
 * skipped to avoid noise. Case-insensitive (including Greek).
 *
 * The first match receives a `data-first-hit` attribute and is scrolled
 * into view.
 */
function highlightInNode(root: HTMLElement, terms: string[]) {
  const cleanedTerms = terms
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
  if (cleanedTerms.length === 0) return;

  const pattern = new RegExp(
    cleanedTerms.map(escapeRegExp).join("|"),
    "gi"
  );

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!node.nodeValue || !node.nodeValue.trim()) {
        return NodeFilter.FILTER_REJECT;
      }
      return pattern.test(node.nodeValue)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });
  pattern.lastIndex = 0;

  const textNodes: Text[] = [];
  let n: Node | null = walker.nextNode();
  while (n) {
    textNodes.push(n as Text);
    n = walker.nextNode();
  }

  let isFirst = true;
  let firstMark: HTMLElement | null = null;
  for (const textNode of textNodes) {
    const value = textNode.nodeValue ?? "";
    pattern.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(value)) !== null) {
      if (match.index > lastIndex) {
        frag.appendChild(
          document.createTextNode(value.slice(lastIndex, match.index))
        );
      }
      const mark = document.createElement("mark");
      mark.setAttribute("data-ai", "1");
      mark.className = "bg-cyan-accent/40 rounded px-0.5 text-ink";
      mark.textContent = match[0];
      if (isFirst) {
        mark.setAttribute("data-first-hit", "1");
        firstMark = mark;
        isFirst = false;
      }
      frag.appendChild(mark);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < value.length) {
      frag.appendChild(document.createTextNode(value.slice(lastIndex)));
    }
    textNode.parentNode?.replaceChild(frag, textNode);
  }

  if (firstMark) {
    firstMark.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
