"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { GitHubMark } from "@/components/github-mark";
import { navigation, site } from "@/lib/site";

/**
 * The running head of the herbarium: a catalogue strip carrying the repository
 * line, the primary navigation, and the GitHub mark. The mobile menu is a real
 * disclosure with keyboard and escape handling, not a hover trick.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-40 border-b border-paper-edge bg-paper/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="group flex min-w-0 items-baseline gap-2.5">
          <span
            aria-hidden
            className="mt-1 h-3.5 w-3.5 shrink-0 border border-field bg-field-bright"
          />
          <span className="truncate font-[family-name:var(--font-bodoni)] text-lg leading-none tracking-tight">
            Safety Herbarium
          </span>
        </Link>

        <nav aria-label="Primary" className="ml-auto hidden items-center gap-1 lg:flex">
          {navigation.slice(0, 6).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`rounded-sm px-2.5 py-1.5 font-[family-name:var(--font-body)] text-sm transition-colors hover:bg-paper-deep ${
                isActive(item.href) ? "text-field underline decoration-strap underline-offset-4" : "text-ink-soft"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <a
          href={site.repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View the source of ${site.name} on GitHub`}
          className="ml-auto inline-flex items-center gap-1.5 rounded-sm border border-ink px-2.5 py-1.5 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] text-ink transition-colors hover:bg-ink hover:text-paper lg:ml-0"
        >
          <GitHubMark className="h-3.5 w-3.5" />
          View source
        </a>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-ink text-ink lg:hidden"
        >
          {open ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        </button>
      </div>

      {open ? (
        <div id="mobile-nav" className="border-t border-paper-edge bg-paper lg:hidden">
          <nav aria-label="Primary, mobile" className="mx-auto max-w-6xl px-4 py-2 sm:px-6">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={isActive(item.href) ? "page" : undefined}
                className="flex items-baseline justify-between border-b border-rule/50 py-2.5 last:border-b-0"
              >
                <span
                  className={`font-[family-name:var(--font-body)] ${isActive(item.href) ? "text-field" : "text-ink"}`}
                >
                  {item.label}
                </span>
                <span className="label-caps">{item.blurb}</span>
              </Link>
            ))}
            <a
              href={site.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              aria-label={`Star ${site.name} on GitHub`}
              className="mt-3 mb-4 flex items-center justify-center gap-2 rounded-sm border border-ink px-3 py-2.5 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em]"
            >
              <GitHubMark className="h-4 w-4" />
              Star on GitHub
            </a>
          </nav>
        </div>
      ) : null}
    </header>
  );
}