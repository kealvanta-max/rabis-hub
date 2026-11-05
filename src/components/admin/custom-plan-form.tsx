"use client";

import { useState } from "react";
import { Link2, Check, Plus, Pencil } from "lucide-react";

import Button from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { useToastContext } from "@/components/layout/toast-provider";
import ActionButton from "@/components/admin/action-button";
import {
  FREQUENCY_PRESETS,
  planPreview,
  validatePlanInput,
  type CustomPlan,
  type PlanInput,
} from "@/lib/custom-plans";
import { cn } from "@/lib/utils";

const EMPTY: PlanInput = { name: "", amt: "", freq: "", ret: "", slots: "", whatsappLink: "" };

function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-gray-300">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-[11px] font-medium text-red-300">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}

const inputClass =
  "h-11 w-full min-w-0 rounded-xl bg-black/30 px-3 text-sm text-gray-100 outline-none ring-1 ring-inset ring-white/10 transition-colors placeholder:text-gray-600 focus:ring-emerald-400/60";

/**
 * The plan form, rebuilt around one rule: **only the name is required.**
 *
 * Rabi builds plans mid-conversation on a phone. Four mandatory fields meant
 * four chances to be blocked, and the old form threw the whole thing away on a
 * single miss. Now she can save a half-decided plan, come back, and paste the
 * group link in the same screen she creates it on.
 */
function PlanForm({
  initial,
  existing,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: PlanInput;
  existing: string[];
  submitLabel: string;
  onSubmit: (plan: CustomPlan) => Promise<void>;
  onCancel: () => void;
}) {
  const { addToast } = useToastContext();
  const [form, setForm] = useState<PlanInput>(initial);
  const [errors, setErrors] = useState<ReturnType<typeof validatePlanInput>["errors"]>({});
  const [saving, setSaving] = useState(false);

  const set = (key: keyof PlanInput) => (value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const preview = planPreview({
    id: "preview",
    name: form.name,
    ...(form.amt ? { amt: Number(form.amt) } : {}),
    ...(form.freq ? { freq: form.freq } : {}),
    ...(form.ret ? { ret: Number(form.ret) } : {}),
    ...(form.slots ? { slots: Number(form.slots) } : {}),
  });

  const handleSubmit = async () => {
    const result = validatePlanInput(form, existing);
    if (!result.ok || !result.plan) {
      setErrors(result.errors);
      addToast("Check the highlighted field — the rest can stay blank.", "error");
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await onSubmit(result.plan);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Field
        htmlFor="plan-name"
        label="Plan name"
        error={errors.name}
        hint="The only required field. e.g. “Daily GH₵50” or “Flexi — 3 weeks”."
      >
        <input
          id="plan-name"
          value={form.name}
          onChange={(event) => set("name")(event.target.value)}
          placeholder="Daily GH₵50"
          className={inputClass}
          autoComplete="off"
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          htmlFor="plan-amt"
          label="Contribution (GH₵)"
          error={errors.amt}
          hint="Optional — leave blank if you quote it on WhatsApp."
        >
          <input
            id="plan-amt"
            value={form.amt}
            onChange={(event) => set("amt")(event.target.value)}
            inputMode="decimal"
            placeholder="50"
            className={inputClass}
          />
        </Field>

        <Field
          htmlFor="plan-ret"
          label="Payout to member (GH₵)"
          error={errors.ret}
          hint="Optional. Blank shows “Flexible — Rabi quotes this” on the site."
        >
          <input
            id="plan-ret"
            value={form.ret}
            onChange={(event) => set("ret")(event.target.value)}
            inputMode="decimal"
            placeholder="1200"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="min-w-0">
        <Field
          htmlFor="plan-freq"
          label="How often does she pay?"
          hint="Tap one, or type anything — “Every Monday” is a valid answer."
        >
          <input
            id="plan-freq"
            value={form.freq}
            onChange={(event) => set("freq")(event.target.value)}
            placeholder="Daily"
            className={inputClass}
            autoComplete="off"
          />
        </Field>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {FREQUENCY_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => set("freq")(preset)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                form.freq === preset
                  ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-inset ring-emerald-400/40"
                  : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200"
              )}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          htmlFor="plan-slots"
          label="Slots"
          error={errors.slots}
          hint="Optional. Blank means no slot limit."
        >
          <input
            id="plan-slots"
            value={form.slots}
            onChange={(event) => set("slots")(event.target.value)}
            inputMode="numeric"
            placeholder="No limit"
            className={inputClass}
          />
        </Field>

        <Field
          htmlFor="plan-wa"
          label="WhatsApp group link"
          error={errors.whatsappLink}
          hint="Members on this plan get this button automatically once you approve them."
        >
          <div className="relative">
            <Link2
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-600"
              aria-hidden="true"
            />
            <input
              id="plan-wa"
              type="url"
              inputMode="url"
              spellCheck={false}
              autoComplete="off"
              value={form.whatsappLink}
              onChange={(event) => set("whatsappLink")(event.target.value)}
              placeholder="https://chat.whatsapp.com/…"
              className={cn(inputClass, "pl-9 text-xs")}
            />
          </div>
        </Field>
      </div>

      {/* Live preview — exactly what the member will read on the site. */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300/80">
          Members will see
        </p>
        <p className="mt-1 font-grotesk text-sm font-semibold text-white">{preview.title}</p>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-[11px] text-gray-400 sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-gray-500">Rate</dt>
            <dd className="truncate text-gray-200">{preview.rate}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-gray-500">Payout</dt>
            <dd className="truncate text-gray-200">{preview.payout}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-gray-500">Slots</dt>
            <dd className="truncate text-gray-200">{preview.slots}</dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <ActionButton variant="ghost" size="md" onClick={onCancel} className="sm:w-auto">
          Cancel
        </ActionButton>
        <Button onClick={handleSubmit} loading={saving} className="w-full sm:w-auto">
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

export function AddCustomPlan({
  onAdd,
  existing = [],
}: {
  onAdd: (plan: CustomPlan) => Promise<void>;
  existing?: string[];
}) {
  const { addToast } = useToastContext();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-grotesk text-sm font-semibold text-white">Create a susu plan</h3>
          <p className="mt-1 text-xs text-gray-400">
            Only the name is required — you can finish the rest later, including the group link.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="w-full gap-2 sm:w-auto">
          <Plus className="h-4 w-4" aria-hidden="true" /> New plan
        </Button>
      </div>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="New susu plan">
        <PlanForm
          initial={EMPTY}
          existing={existing}
          submitLabel="Save plan to the live site"
          onCancel={() => setOpen(false)}
          onSubmit={async (plan) => {
            await onAdd(plan);
            addToast(`${plan.name} is live.`, "success");
            setOpen(false);
          }}
        />
      </Modal>
    </>
  );
}

export function EditCustomPlan({
  plan,
  onSave,
  existing = [],
}: {
  plan: CustomPlan;
  onSave: (plan: CustomPlan) => Promise<void>;
  existing?: string[];
}) {
  const { addToast } = useToastContext();
  const [open, setOpen] = useState(false);

  return (
    <>
      <ActionButton variant="neutral" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
      </ActionButton>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={`Edit ${plan.name}`}>
        <PlanForm
          initial={{
            name: plan.name ?? "",
            amt: plan.amt !== undefined ? String(plan.amt) : "",
            freq: plan.freq ?? "",
            ret: plan.ret !== undefined ? String(plan.ret) : "",
            slots: plan.slots !== undefined ? String(plan.slots) : "",
            whatsappLink: plan.whatsappLink ?? "",
          }}
          existing={existing}
          submitLabel="Save changes"
          onCancel={() => setOpen(false)}
          onSubmit={async (updated) => {
            // The id must never change: member documents and links key off it.
            await onSave({ ...updated, id: plan.id });
            addToast("Plan updated on the live site.", "success");
            setOpen(false);
          }}
        />
      </Modal>
    </>
  );
}

/** Small read-out used in the plan card list. */
export function PlanLinkBadge({ link }: { link?: string }) {
  if (!link) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-inset ring-amber-400/25">
        No group link yet
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-400/25">
      <Check className="h-2.5 w-2.5" aria-hidden="true" /> Group link added
    </span>
  );
}
