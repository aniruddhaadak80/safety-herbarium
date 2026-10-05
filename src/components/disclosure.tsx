"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A disclosure built on a real button and `aria-expanded`, so keyboard and screen
 * reader users get the same behaviour as everyone else. Content stays in the DOM
 * only while open, which keeps the page honest about what is present.
 */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-sm border border-rule bg-paper-deep/30">
      <h3 className="m-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] text-ink-soft hover:text-field"
        >
          {summary}
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      </h3>
      {open ? <div className="border-t border-rule px-4 py-4">{children}</div> : null}
    </div>
  );
}