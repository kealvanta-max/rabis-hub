"use client";

import { CalendarDays, Mail, MapPin, Phone, Wallet } from "lucide-react";
import Badge from "@/components/ui/badge";
import ActionButton from "@/components/admin/action-button";
import MemberAvatar from "@/components/admin/member-avatar";
import { formatDate } from "@/lib/utils";
import type { UserItem } from "@/components/admin/types";

interface UserRowProps {
  user: UserItem;
  planLabel: string;
  onOpen: () => void;
  onApprove: () => void;
  onReject: () => void;
}

/**
 * One member, one scannable card.
 *
 * Three fixed zones — identity, facts, actions — instead of one wrapping flex
 * row. The status badge lives inside the identity line and can wrap with the
 * name, so it can never drift over the buttons; facts sit in a two-column
 * definition list with real icons (no `•` characters to break line rhythm);
 * actions get their own footer so the thumb target never collides with text.
 */
export default function UserRow({ user, planLabel, onOpen, onApprove, onReject }: UserRowProps) {
  const location = user.gpsAddress || user.location || "Location not shared";
  const joined = user.createdAt ? formatDate(user.createdAt, "") : "";

  const facts = [
    { icon: Mail, value: user.email, href: `mailto:${user.email}`, srLabel: "Email" },
    { icon: Phone, value: user.phone, href: `tel:${user.phone}`, srLabel: "Phone" },
    { icon: Wallet, value: planLabel, srLabel: "Plan" },
    { icon: MapPin, value: location, srLabel: "Location" },
  ].filter((fact) => Boolean(fact.value));

  return (
    <article className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] transition-colors hover:border-white/[0.12]">
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <MemberAvatar name={user.name} src={user.passportPhoto} size={48} />

          <div className="min-w-0 flex-1">
            {/* Identity line: name and status share a wrapping row, never absolute. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="min-w-0 max-w-full truncate font-grotesk text-[15px] font-semibold text-white">
                {user.name}
              </h3>
              <Badge status={user.status} />
            </div>

            {/* Facts: two columns on phones, three on tablets — no bullet glyphs. */}
            <dl className="mt-2.5 grid grid-cols-1 gap-x-5 gap-y-1.5 text-xs sm:grid-cols-2 xl:grid-cols-3">
              {facts.map((fact) => {
                const Icon = fact.icon;
                const content = (
                  <>
                    <Icon className="mt-px h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden="true" />
                    <span className="sr-only">{fact.srLabel}: </span>
                    <span className="truncate text-gray-400">{fact.value}</span>
                  </>
                );

                return (
                  <div key={fact.srLabel} className="flex min-w-0 items-start gap-1.5">
                    {fact.href ? (
                      <a
                        href={fact.href}
                        title={fact.value}
                        className="flex min-w-0 items-start gap-1.5 rounded transition-colors hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
                      >
                        {content}
                      </a>
                    ) : (
                      <span title={fact.value} className="flex min-w-0 items-start gap-1.5">
                        {content}
                      </span>
                    )}
                  </div>
                );
              })}
            </dl>

            {joined && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-500">
                <CalendarDays className="h-3 w-3" aria-hidden="true" />
                Joined {joined}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Actions: their own row, evenly split, nothing overlapping. */}
      <div className="grid grid-cols-2 gap-2 border-t border-white/[0.06] bg-black/20 p-3 sm:flex sm:items-center sm:justify-end">
        <ActionButton variant="neutral" size="sm" onClick={onOpen} className="sm:order-last">
          Review
        </ActionButton>
        {user.status !== "approved" && (
          <ActionButton variant="approve" size="sm" onClick={onApprove}>
            Approve
          </ActionButton>
        )}
        {user.status !== "rejected" && (
          <ActionButton variant="danger" size="sm" onClick={onReject}>
            Reject
          </ActionButton>
        )}
      </div>
    </article>
  );
}
