"use client";

import { useMemo, useState } from "react";
import { Quote, Star, Trash2 } from "lucide-react";
import ActionButton from "@/components/admin/action-button";
import { cn } from "@/lib/utils";
import type { TestimonialItem } from "@/components/admin/types";

type Filter = "all" | "pending" | "approved" | "rejected";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

interface ReviewsPanelProps {
  testimonials: TestimonialItem[];
  onStatus: (id: string, status: "approved" | "rejected") => void;
  onDelete: (id: string) => void;
  toolbar?: React.ReactNode;
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          aria-hidden="true"
          className={cn("h-3.5 w-3.5", index < rating ? "fill-gold text-gold" : "text-white/15")}
        />
      ))}
    </div>
  );
}

/**
 * Reviews moderation.
 *
 * The card is a header / body / footer stack: badges stay beside the name in the
 * header (they can wrap, they can never float over content), the quote owns the
 * body, and the three actions sit in their own footer grid. On a 360 px screen
 * that grid is two columns with Delete spanning both, so nothing bleeds past the
 * viewport edge like it did before.
 */
export default function ReviewsPanel({ testimonials, onStatus, onDelete, toolbar }: ReviewsPanelProps) {
  const [filter, setFilter] = useState<Filter>("pending");

  const counts = useMemo(
    () => ({
      all: testimonials.length,
      pending: testimonials.filter((item) => item.status === "pending").length,
      approved: testimonials.filter((item) => item.status === "approved").length,
      rejected: testimonials.filter((item) => item.status === "rejected").length,
    }),
    [testimonials]
  );

  const visible = useMemo(
    () => (filter === "all" ? testimonials : testimonials.filter((item) => item.status === filter)),
    [testimonials, filter]
  );

  return (
    <section aria-label="Testimonials moderation" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {FILTERS.map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(item.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60",
                  active
                    ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-400/30"
                    : "text-gray-400 ring-1 ring-inset ring-white/10 hover:text-white"
                )}
              >
                {item.label}
                <span className={cn("text-[10px] font-bold", active ? "text-emerald-300/80" : "text-gray-500")}>
                  {counts[item.id]}
                </span>
              </button>
            );
          })}
        </div>
        {toolbar}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-gray-500">
          Nothing here yet{filter !== "all" ? ` — no ${filter} reviews` : ""}.
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((testimonial) => (
            <li key={testimonial.id}>
              <article className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025]">
                <div className="p-4">
                  {/* Header: name + state chips, wrapping inside their own row. */}
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-grotesk text-sm font-semibold text-white">
                        {testimonial.userName}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-gray-500">{testimonial.planName}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset",
                          testimonial.status === "approved" && "bg-emerald-500/12 text-emerald-300 ring-emerald-500/25",
                          testimonial.status === "pending" && "bg-amber-500/12 text-amber-300 ring-amber-500/25",
                          testimonial.status === "rejected" && "bg-red-500/12 text-red-300 ring-red-500/25"
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            testimonial.status === "approved" && "bg-emerald-400",
                            testimonial.status === "pending" && "bg-amber-400",
                            testimonial.status === "rejected" && "bg-red-400"
                          )}
                        />
                        {testimonial.status}
                      </span>
                      {testimonial.isStatic && (
                        <span className="rounded-full bg-sky-500/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-300 ring-1 ring-inset ring-sky-500/25">
                          Static
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Body: rating then quote, with room to breathe. */}
                  <div className="mt-3">
                    <Stars rating={testimonial.rating} />
                    <blockquote className="mt-2 flex gap-2 text-sm leading-relaxed text-gray-300">
                      <Quote className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-400/50" aria-hidden="true" />
                      <span className="min-w-0 break-words">{testimonial.review}</span>
                    </blockquote>
                  </div>
                </div>

                {/* Footer: safe action first, destructive last and quieter. */}
                <div className="grid grid-cols-2 gap-2 border-t border-white/[0.06] bg-black/20 p-3 sm:flex sm:justify-end">
                  {testimonial.status !== "approved" && (
                    <ActionButton variant="approve" size="sm" onClick={() => onStatus(testimonial.id, "approved")}>
                      Approve
                    </ActionButton>
                  )}
                  {testimonial.status !== "rejected" && (
                    <ActionButton variant="danger" size="sm" onClick={() => onStatus(testimonial.id, "rejected")}>
                      Reject
                    </ActionButton>
                  )}
                  <ActionButton
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(testimonial.id)}
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    className="col-span-2 sm:col-span-1"
                  >
                    Delete
                  </ActionButton>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
