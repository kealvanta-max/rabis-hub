"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Coins,
  Trash2,
  BadgeCheck,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Mail,
  MapPin,
  ShieldCheck,
  Video,
} from "lucide-react";
import Modal from "@/components/ui/modal";
import Badge from "@/components/ui/badge";
import ActionButton from "@/components/admin/action-button";
import MemberAvatar from "@/components/admin/member-avatar";
import { formatDate } from "@/lib/utils";
import { contributionSummary, humaniseLastContribution } from "@/lib/savings";
import type { UserItem } from "@/components/admin/types";

interface UserDetailModalProps {
  user: UserItem | null;
  planLabel: string;
  ocrVerified: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onReset: () => void;
  onDownload: () => void;
  onCopyGps: (value: string) => void;
  /** Sends the decision email again from the server. */
  onResendEmail: () => void;
  /** Rabi records money she has actually received — no gateway involved. */
  onRecordContribution: (amount: number) => Promise<void> | void;
  onRemoveContribution: (index: number) => Promise<void> | void;
  /** Clears a test row, or a person who asked to be forgotten. Asks first. */
  onDelete: () => void;
}


/** One sentence describing whether the member was actually told. */
function decisionEmailState(user: UserItem): string {
  const status = (user as UserItem & { decisionEmailStatus?: string }).decisionEmailStatus;

  if (status === "sent") return "Delivered to the member.";
  if (status === "logged") return "Written to the server log. Sending starts once the domain is verified.";
  if (status === "failed") return "The last attempt failed. Send it again, or check the server log.";
  return "Not sent yet.";
}

function DataRow({
  label,
  children,
  href,
}: {
  label: string;
  children: React.ReactNode;
  href?: string;
}) {
  const value = href ? (
    <a
      href={href}
      className="break-words text-sm text-gray-100 underline decoration-white/20 underline-offset-4 transition-colors hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
    >
      {children}
    </a>
  ) : (
    <span className="break-words text-sm text-gray-100">{children}</span>
  );

  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">{label}</dt>
      <dd className="mt-1 min-w-0">{value}</dd>
    </div>
  );
}

/**
 * Member review sheet.
 *
 * Everything a human needs to make an approve/reject call in one scroll:
 * identity, contact, card PIN + format state, location as an actionable map
 * link, and the three documents with their verification context. The OCR
 * warning explains *what to do*, and the media player keeps native controls
 * instead of a custom overlay fighting them.
 */
export default function UserDetailModal({
  user,
  planLabel,
  ocrVerified,
  onClose,
  onApprove,
  onReject,
  onReset,
  onDownload,
  onCopyGps,
  onResendEmail,
  onRecordContribution,
  onRemoveContribution,
  onDelete,
}: UserDetailModalProps) {
  // Hooks first, unconditionally — the component returns early without a user.
  const [contribution, setContribution] = useState("");
  const [savingContribution, setSavingContribution] = useState(false);

  const gps = useMemo(() => {
    if (!user || typeof user.gpsLat !== "number" || typeof user.gpsLng !== "number") return null;
    return `${user.gpsLat.toFixed(6)}, ${user.gpsLng.toFixed(6)}`;
  }, [user]);

  if (!user) return null;

  const mapUrl = gps
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(gps.replace(/\s/g, ""))}`
    : null;

  const documents = [
    { label: "Ghana Card · Front", url: user.ghanaCardFront, tag: "OCR" },
    { label: "Ghana Card · Back", url: user.ghanaCardBack, tag: null },
    { label: "Passport photo", url: user.passportPhoto, tag: "Face" },
  ];

  const savings = contributionSummary(user?.contributions);

  const saveContribution = async () => {
    const amount = Number(contribution);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setSavingContribution(true);
    try {
      await onRecordContribution(amount);
      setContribution("");
    } finally {
      setSavingContribution(false);
    }
  };

  return (
    <Modal isOpen={Boolean(user)} onClose={onClose} title="Member review" maxWidth="max-w-2xl">
      <div className="space-y-5">
        {/* Identity */}
        <div className="flex items-start gap-3">
          <MemberAvatar name={user.name} src={user.passportPhoto} size={56} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h4 className="min-w-0 truncate font-grotesk text-lg font-semibold text-white">{user.name}</h4>
              <Badge status={user.status} />
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {planLabel}
              {user.createdAt ? ` · joined ${formatDate(user.createdAt, "")}` : ""}
            </p>
          </div>
          <ActionButton variant="ghost" size="sm" onClick={onDownload} icon={<Download className="h-4 w-4" />}>
            <span className="sr-only sm:not-sr-only">JSON</span>
          </ActionButton>
        </div>

        {/* Contact — single column on phones so long addresses can never collide */}
        <dl className="grid grid-cols-1 gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:grid-cols-2">
          <DataRow label="Email" href={`mailto:${user.email}`}>
            {user.email || "-"}
          </DataRow>
          <DataRow label="Phone" href={`tel:${user.phone}`}>
            {user.phone || "-"}
          </DataRow>
          <DataRow label="Plan">{planLabel}</DataRow>
          <DataRow label="Location">{user.gpsAddress || user.location || "Not shared"}</DataRow>
        </dl>

        {/*
          Delivery state for the decision email.
          "Approved" on screen used to mean nothing: the browser fired the mail
          and swallowed the result. Now the record says whether the member was
          actually told, and this is where Rabi sees it.
        */}
        {user.status !== "pending" && (
          <section
            aria-label="Decision email"
            className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                  Decision email
                </p>
                <p className="mt-1 text-sm text-gray-200">{decisionEmailState(user)}</p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  Sent by the server, so it does not depend on this tab staying open.
                </p>
              </div>
              <ActionButton
                variant="neutral"
                size="md"
                onClick={onResendEmail}
                className="sm:w-auto"
                icon={<Mail className="h-4 w-4" aria-hidden="true" />}
              >
                Send again
              </ActionButton>
            </div>
          </section>
        )}

        {/* Savings — what Rabi has actually received. One tap, no gateway. */}
        <section aria-label="Savings recorded" className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                Savings recorded
              </p>
              <p className="mt-1 font-grotesk text-xl font-semibold text-white">
                GH₵{savings.total.toLocaleString("en-GH")}
              </p>
              <p className="mt-0.5 text-[11px] text-gray-400">
                {savings.count} payment{savings.count === 1 ? "" : "s"} · {humaniseLastContribution(savings.last)}
              </p>
            </div>
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-300">
              <Coins className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <div className="min-w-0 flex-1">
              <label htmlFor="contribution-amount" className="mb-1.5 block text-[11px] text-gray-400">
                Amount received (GH₵)
              </label>
              <input
                id="contribution-amount"
                value={contribution}
                onChange={(event) => setContribution(event.target.value)}
                inputMode="decimal"
                placeholder="50"
                className="h-10 w-full rounded-xl bg-black/30 px-3 text-sm text-gray-100 outline-none ring-1 ring-inset ring-white/10 placeholder:text-gray-600 focus:ring-emerald-400/60"
              />
            </div>
            <ActionButton
              variant="primary"
              size="md"
              onClick={() => void saveContribution()}
              className="self-end sm:w-auto"
            >
              {savingContribution ? "Recording…" : "Record payment"}
            </ActionButton>
          </div>

          {(user.contributions ?? []).length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {(user.contributions ?? [])
                .map((entry, index) => ({ entry, index }))
                .slice(-4)
                .reverse()
                .map(({ entry, index }) => (
                  <li
                    key={`${entry.date}-${index}`}
                    className="flex items-center justify-between gap-2 rounded-lg bg-black/25 px-2.5 py-1.5"
                  >
                    <span className="min-w-0 truncate text-[11px] text-gray-300">
                      GH₵{entry.amount} · {entry.date}
                    </span>
                    <button
                      type="button"
                      onClick={() => void onRemoveContribution(index)}
                      className="shrink-0 rounded-md p-1 text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60"
                      aria-label={`Remove the GH₵${entry.amount} payment from ${entry.date}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </section>

        {/* Identity document */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                Ghana Card number
              </p>
              <p className="mt-1 font-mono text-sm tracking-wide text-white">
                {user.ghanaCardNumber || "Not provided"}
              </p>
            </div>
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                user.ghanaCardValid
                  ? "bg-emerald-500/12 text-emerald-300 ring-1 ring-inset ring-emerald-500/25"
                  : "bg-red-500/12 text-red-300 ring-1 ring-inset ring-red-500/25"
              }`}
            >
              {user.ghanaCardValid ? <BadgeCheck className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {user.ghanaCardValid ? "Format valid" : "Invalid format"}
            </span>
          </div>

          {/* Location becomes an action, not a string of numbers */}
          {gps && mapUrl && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/12 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
              >
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                Open in Google Maps
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
              <button
                type="button"
                onClick={() => onCopyGps(gps)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
              >
                <Copy className="h-3 w-3" aria-hidden="true" />
                {gps}
              </button>
            </div>
          )}
        </div>

        {/* Documents promised on WhatsApp — the one case where an empty frame is expected */}
        {user.documentsDeferred && (
          <div className="rounded-2xl bg-amber-500/[0.07] p-4 ring-1 ring-inset ring-amber-500/25">
            <p className="text-sm font-semibold text-amber-200">Documents promised on WhatsApp</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-400">
              Storage refused this member&apos;s upload, so they agreed to send the Ghana Card and selfie to you
              directly. Ask for them before you approve, then record the payment as usual.
            </p>
          </div>
        )}

        {/* Verification context */}
        {user.ghanaCardOcrResult && (
          <div
            className={`rounded-2xl p-4 ring-1 ring-inset ${
              ocrVerified
                ? "bg-emerald-500/[0.07] ring-emerald-500/20"
                : "bg-amber-500/[0.07] ring-amber-500/25"
            }`}
          >
            <div className="flex items-start gap-3">
              {ocrVerified ? (
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
              ) : (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${ocrVerified ? "text-emerald-200" : "text-amber-200"}`}>
                  {ocrVerified ? "Card number matches the photo" : "We could not read this card automatically"}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-gray-400">
                  {ocrVerified
                    ? "The number printed on the card was read on the member's phone and matches what they typed. Approve as normal."
                    : "The scan was blurry, glared or failed on a slow connection. Compare the card photo below with the number above before deciding, everything else about this member can be fine."}
                </p>
                <a
                  href="#kyc-documents"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-200 underline decoration-amber-300/40 underline-offset-4 hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
                >
                  Check the documents
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Liveness clip — native controls, download as its own control */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-300">
              <Video className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
              Liveness scan
            </p>
            {user.faceScanVideo ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                <ShieldCheck className="h-3 w-3" /> Verified
              </span>
            ) : (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Not recorded</span>
            )}
          </div>

          {user.faceScanVideo ? (
            <>
              <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
                <video
                  src={user.faceScanVideo}
                  controls
                  playsInline
                  preload="metadata"
                  className="block aspect-video w-full bg-black object-contain"
                />
              </div>
              <a
                href={user.faceScanVideo}
                download
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-gray-400 transition-colors hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Download clip
              </a>
            </>
          ) : (
            <p className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-4 text-center text-xs text-gray-500">
              No liveness clip, reviewed manually.
            </p>
          )}
        </div>

        {/* Documents */}
        <div id="kyc-documents" className="scroll-mt-24">
          <p className="mb-2 text-xs font-semibold text-gray-300">Documents</p>
          <div className="grid grid-cols-3 gap-2">
            {documents.map((document) => (
              <figure key={document.label} className="min-w-0">
                <div className="relative aspect-[3/2] overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                  {document.url ? (
                    <a href={document.url} target="_blank" rel="noopener noreferrer" className="block h-full w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={document.url}
                        alt={document.label}
                        loading="lazy"
                        className="h-full w-full object-cover object-center transition-transform duration-300 hover:scale-[1.03]"
                      />
                    </a>
                  ) : (
                    <span className="grid h-full place-items-center text-[10px] text-gray-600">Not uploaded</span>
                  )}
                  {document.tag && document.url && (
                    <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/80 backdrop-blur">
                      {document.tag}
                    </span>
                  )}
                </div>
                <figcaption className="mt-1 truncate text-[10px] text-gray-500">{document.label}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>

      {/* Decisions */}
      <div className="mt-4 grid grid-cols-1 gap-2 border-t border-white/[0.08] pt-4 sm:grid-cols-3">
        {user.status !== "approved" ? (
          <ActionButton variant="primary" size="md" onClick={onApprove} fullWidth>
            Approve member
          </ActionButton>
        ) : (
          <ActionButton variant="neutral" size="md" onClick={onReset} fullWidth>
            Move back to pending
          </ActionButton>
        )}
        {user.status !== "rejected" && (
          <ActionButton variant="danger" size="md" onClick={onReject} fullWidth>
            Reject…
          </ActionButton>
        )}
      </div>

      {/*
       * Deletion lives apart from the decisions above, in its own bordered block,
       * so a thumb reaching for "Reject" cannot land on it. This is the control
       * Rabi uses to clear test rows before handing the panel over.
       */}
      <div className="mt-4 border-t border-white/[0.08] pt-4">
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-300/90 transition-colors hover:bg-red-500/10 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Delete this member
        </button>
        <p className="mt-1.5 max-w-prose text-[11px] leading-relaxed text-gray-500">
          Removes the application, the document links and the payment history for good. Their
          login still exists in Firebase Auth, so delete it there too if this was a test account.
        </p>
      </div>
    </Modal>
  );
}
