"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Share2, ShieldCheck, Trash2, Link2, Link2Off, Copy, Check } from "lucide-react";
import type { Volume } from "@/lib/types";

/**
 * Volume-level actions: share, verify, and retire.
 *
 * Every one of these calls a real endpoint and reports what came back, including
 * failures. Retirement is explained in the confirmation, because it writes a
 * tombstone rather than erasing anything, and the copy has to say so.
 */
export function VolumeActions({ volume }: { volume: Volume }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"share" | "unshare" | "verify" | "retire" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(
    volume.shareToken ? `/share/${volume.shareToken}` : null,
  );

  async function post(path: string, body: unknown) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const error = payload.error as { message?: string } | undefined;
      throw new Error(error?.message ?? "Request failed.");
    }
    return payload;
  }

  async function run(kind: "share" | "unshare" | "verify" | "retire") {
    setBusy(kind);
    setMessage(null);
    try {
      if (kind === "share") {
        const payload = await post(`/api/volumes/${volume.id}/share`, { enabled: true });
        const token = payload.shareToken as string;
        setShareUrl(`/share/${token}`);
        setMessage({ tone: "ok", text: "Public link created. Anyone with it can read this volume." });
      } else if (kind === "unshare") {
        await post(`/api/volumes/${volume.id}/share`, { enabled: false });
        setShareUrl(null);
        setMessage({ tone: "ok", text: "Public link revoked." });
      } else if (kind === "verify") {
        const response = await fetch(`/api/volumes/${volume.id}/verify`);
        const payload = (await response.json()) as {
          ok: boolean;
          events: number;
          brokenAtSeq: number | null;
          reason: string | null;
        };
        setMessage({
          tone: payload.ok ? "ok" : "err",
          text: payload.ok
            ? `Chain replayed across ${payload.events} events with no broken link.`
            : `Broken at event ${payload.brokenAtSeq}: ${payload.reason}`,
        });
      } else {
        if (
          !window.confirm(
            "Retire this volume? Its sheets and audit chain are kept as a tombstone so existing seals stay verifiable, but it stops accepting new sheets.",
          )
        ) {
          return;
        }
        await fetch(`/api/volumes/${volume.id}`, { method: "DELETE" });
        setMessage({ tone: "ok", text: "Volume retired. The chain is still replayable." });
        router.refresh();
      }
    } catch (error) {
      setMessage({
        tone: "err",
        text: error instanceof Error ? error.message : "Something went wrong.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    const absolute = `${window.location.origin}${shareUrl}`;
    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage({ tone: "err", text: "Could not copy. Select the link and copy it manually." });
    }
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-2">
        {shareUrl ? (
          <>
            <button
              type="button"
              onClick={() => {
                void run("unshare");
              }}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-sm border border-rule px-3 py-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] text-ink-soft transition-colors hover:border-stamp hover:text-stamp disabled:opacity-50"
            >
              <Link2Off className="h-3.5 w-3.5" aria-hidden />
              Revoke link
            </button>
            <button
              type="button"
              onClick={() => {
                void copyLink();
              }}
              className="inline-flex items-center gap-2 rounded-sm border border-rule px-3 py-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] text-ink-soft transition-colors hover:border-field hover:text-field"
            >
              {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copied ? "Copied" : "Copy link"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => run("share")}
            disabled={busy !== null || volume.status === "retired"}
            className="inline-flex items-center gap-2 rounded-sm border border-ink px-3 py-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] transition-colors hover:bg-ink hover:text-paper disabled:opacity-50"
          >
            <Share2 className="h-3.5 w-3.5" aria-hidden />
            Share read-only
          </button>
        )}

        <button
          type="button"
          onClick={() => run("verify")}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-sm border border-ink px-3 py-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] transition-colors hover:bg-ink hover:text-paper disabled:opacity-50"
        >
          {busy === "verify" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          )}
          Verify chain
        </button>

        {volume.status === "active" ? (
          <button
            type="button"
            onClick={() => run("retire")}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-sm border border-rule px-3 py-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] text-ink-soft transition-colors hover:border-stamp hover:text-stamp disabled:opacity-50"
          >
            {busy === "retire" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            )}
            Retire
          </button>
        ) : null}
      </div>

      {shareUrl ? (
        <a
          href={shareUrl}
          className="mt-2 inline-flex items-center gap-1.5 figure text-[0.625rem] text-ink-faint underline decoration-rule underline-offset-4 hover:text-field"
        >
          <Link2 className="h-3 w-3" aria-hidden />
          {shareUrl}
        </a>
      ) : null}

      {message ? (
        <p
          role="status"
          className={`mt-3 font-[family-name:var(--font-body)] text-sm ${message.tone === "ok" ? "text-field" : "text-stamp"}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}