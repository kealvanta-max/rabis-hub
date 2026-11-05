"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Link2, Search, Save } from "lucide-react";
import ActionButton from "@/components/admin/action-button";
import { planLabels } from "@/lib/plans-data";
import { groupPlanEntries } from "@/lib/admin-query";
import { cn } from "@/lib/utils";

interface WhatsAppLinksPanelProps {
  links: Record<string, string>;
  /** Last saved values, used to tell the admin what has changed. */
  baseline: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onSave: () => Promise<void> | void;
}

/**
 * WhatsApp group links, organised the way an admin actually thinks about them.
 *
 * Every field is a full-width block with its label above it, so the input can
 * never push past the container (`w-full` + `min-w-0`), the 17-plan list is
 * broken into labelled families with a search filter, and the save control is a
 * sticky bar that also reports exactly how many changes are pending.
 */
export default function WhatsAppLinksPanel({
  links,
  baseline,
  onChange,
  onSave,
}: WhatsAppLinksPanelProps) {
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const entries = useMemo(() => Object.entries(planLabels), []);

  const grouped = useMemo(() => groupPlanEntries(entries, query), [entries, query]);

  const filled = entries.filter(([key]) => Boolean((links[key] || "").trim())).length;
  const changed = entries.filter(([key]) => (links[key] || "") !== (baseline[key] || "")).length;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="WhatsApp group links" className="space-y-4">
      <header className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-grotesk text-base font-semibold text-white">WhatsApp group links</h2>
            <p className="mt-1 max-w-prose text-xs leading-relaxed text-gray-400">
              When you approve a member, the link for their plan is attached to their account automatically.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            {filled} of {entries.length} set
          </span>
        </div>

        <label className="relative mt-4 block">
          <span className="sr-only">Search plans</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a plan — daily, weekly, achiever…"
            className="h-11 w-full rounded-xl bg-black/30 pl-9 pr-3 text-sm text-gray-100 outline-none ring-1 ring-inset ring-white/10 transition-colors placeholder:text-gray-600 focus:ring-emerald-400/60"
          />
        </label>
      </header>

      {grouped.length === 0 && (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-gray-500">
          No plan matches “{query}”.
        </p>
      )}

      {grouped.map((group) => (
        <section key={group.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="font-grotesk text-sm font-semibold text-white">{group.label}</h3>
            <span className="text-[11px] uppercase tracking-[0.12em] text-gray-500">{group.hint}</span>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {group.items.map(([key, label]) => {
              const value = links[key] || "";
              const isWhatsApp = !value || /^https:\/\/(chat\.)?whatsapp\.com\//i.test(value);

              return (
                <div key={key} className="min-w-0">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label
                      htmlFor={`wa-${key}`}
                      className="truncate text-xs font-medium text-gray-300"
                    >
                      {label}
                    </label>
                    {value && (
                      <a
                        href={value}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-emerald-300 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
                        aria-label={`Test the ${label} link`}
                      >
                        Test <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    )}
                  </div>

                  <div className="relative">
                    <Link2
                      className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-600"
                      aria-hidden="true"
                    />
                    <input
                      id={`wa-${key}`}
                      type="url"
                      inputMode="url"
                      autoComplete="off"
                      spellCheck={false}
                      value={value}
                      onChange={(event) => onChange(key, event.target.value)}
                      placeholder="https://chat.whatsapp.com/…"
                      aria-invalid={!isWhatsApp}
                      className={cn(
                        "h-11 w-full min-w-0 truncate rounded-xl bg-black/30 pl-9 pr-3 text-xs text-gray-100",
                        "outline-none ring-1 ring-inset transition-colors placeholder:text-gray-600",
                        isWhatsApp
                          ? "ring-white/10 focus:ring-emerald-400/60"
                          : "ring-amber-500/50 focus:ring-amber-400/70"
                      )}
                    />
                  </div>
                  {!isWhatsApp && (
                    <p className="mt-1 text-[10px] text-amber-300">
                      This does not look like a WhatsApp invite link.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Sticky action bar — always reachable, never covers a field. */}
      <div className="sticky bottom-24 z-10 md:bottom-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#04150c]/95 p-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl">
          <p className="min-w-0 text-xs text-gray-400" role="status">
            {changed > 0 ? `${changed} unsaved change${changed === 1 ? "" : "s"}` : "All changes saved"}
          </p>
          <ActionButton
            variant="primary"
            size="md"
            onClick={handleSave}
            loading={saving}
            disabled={changed === 0}
            icon={<Save className="h-4 w-4" />}
          >
            Save all links
          </ActionButton>
        </div>
      </div>
    </section>
  );
}
