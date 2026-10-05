"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, FolderPlus } from "lucide-react";
import { ROLES, type Role } from "@/lib/types";

/**
 * Opening a reading volume.
 *
 * This is the product's entry action, so it reports honestly: real validation
 * errors from the server are shown as the server stated them, and success
 * navigates to the volume that now exists in the database.
 */
export function NewVolumeForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [intent, setIntent] = useState("");
  const [role, setRole] = useState<Role>("researcher");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/volumes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, intent, role }),
      });
      const payload = (await response.json()) as
        | { volume: { id: string } }
        | { error: { message: string } };
      if (!response.ok || !("volume" in payload)) {
        setError("error" in payload ? payload.error.message : "Could not create the volume.");
        return;
      }
      router.push(`/volume/${payload.volume.id}`);
      router.refresh();
    } catch {
      setError("Network error. Nothing was created.");
    } finally {
      setBusy(false);
    }
  }

  const nameTooShort = name.trim().length > 0 && name.trim().length < 3;

  return (
    <form onSubmit={submit} className="sheet p-4">
      <p className="label-caps">New accession</p>

      <div className="mt-3 space-y-3">
        <div>
          <label htmlFor="volume-name" className="label-caps">
            Volume name
          </label>
          <input
            id="volume-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            minLength={3}
            maxLength={120}
            aria-describedby={nameTooShort ? "volume-name-hint" : undefined}
            aria-invalid={nameTooShort || undefined}
            placeholder="Frontier safety primer"
            className="mt-1 w-full rounded-sm border border-rule bg-paper px-3 py-2 font-[family-name:var(--font-body)] text-sm"
          />
          {nameTooShort ? (
            <p id="volume-name-hint" className="mt-1 text-xs text-caution">
              At least 3 characters.
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="volume-intent" className="label-caps">
            Intent (optional)
          </label>
          <textarea
            id="volume-intent"
            value={intent}
            onChange={(event) => setIntent(event.target.value)}
            maxLength={600}
            rows={2}
            placeholder="Get to a defensible overview in six weeks."
            className="mt-1 w-full resize-y rounded-sm border border-rule bg-paper px-3 py-2 font-[family-name:var(--font-body)] text-sm"
          />
        </div>

        <div>
          <label htmlFor="volume-role" className="label-caps">
            Read as
          </label>
          <select
            id="volume-role"
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            className="mt-1 w-full rounded-sm border border-rule bg-paper px-3 py-2 font-[family-name:var(--font-body)] text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={busy || name.trim().length < 3}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-sm bg-field px-4 py-2.5 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] text-paper transition-colors hover:bg-field-bright disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <FolderPlus className="h-3.5 w-3.5" aria-hidden />
        )}
        {busy ? "Creating" : "Create volume"}
      </button>

      {error ? (
        <p role="alert" className="mt-2 font-[family-name:var(--font-body)] text-sm text-stamp">
          {error}
        </p>
      ) : null}
    </form>
  );
}