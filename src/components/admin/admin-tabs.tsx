"use client";

import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

export interface AdminTab {
  id: string;
  label: string;
  /** Optional trailing count, e.g. pending reviews. */
  count?: number;
}

interface AdminTabsProps {
  tabs: AdminTab[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
}

/**
 * Scrollable tab bar that never clips.
 *
 * The rail is full-bleed (`-mx-4 px-4`) so its scroll area starts and ends at
 * the viewport edge instead of stopping at the page gutter — that gutters was
 * what made the last tab look chopped off. A masked right edge plus a faint
 * peeking tab signal "there is more", and every tab stays reachable with the
 * arrow keys, Home and End.
 */
export default function AdminTabs({ tabs, value, onChange, ariaLabel = "Admin sections" }: AdminTabsProps) {
  const railRef = useRef<HTMLDivElement>(null);

  const focusTab = useCallback(
    (index: number) => {
      const buttons = railRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      const next = buttons?.[(index + buttons.length) % buttons.length];
      if (next) {
        next.focus();
        onChange(next.dataset.tab ?? value);
        next.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
      }
    },
    [onChange, value]
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.id === value);
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusTab(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusTab(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusTab(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusTab(tabs.length - 1);
    }
  };

  return (
    <div className="relative -mx-4 mb-6 sm:mx-0">
      <div
        ref={railRef}
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        className={cn(
          "no-scrollbar flex snap-x snap-mandatory items-center gap-1 overflow-x-auto px-4 pb-1 sm:px-0",
          "-webkit-overflow-scrolling:touch"
        )}
      >
        {tabs.map((tab) => {
          const active = tab.id === value;
          return (
            <button
              key={tab.id}
              role="tab"
              data-tab={tab.id}
              aria-selected={active}
              aria-controls={`admin-panel-${tab.id}`}
              id={`admin-tab-${tab.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={cn(
                "relative inline-flex shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2.5",
                "text-[13px] font-semibold transition-colors duration-150 outline-none",
                "focus-visible:ring-2 focus-visible:ring-emerald-300/70",
                active
                  ? "bg-emerald-500/[0.14] text-emerald-200"
                  : "text-gray-400 hover:bg-white/[0.05] hover:text-gray-100"
              )}
            >
              {tab.label}
              {typeof tab.count === "number" && tab.count > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
                    active ? "bg-emerald-400 text-[#04150c]" : "bg-white/10 text-gray-300"
                  )}
                >
                  {tab.count}
                </span>
              )}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-3 -bottom-0.5 h-px rounded-full bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Scroll affordance: a soft fade that says "there is another tab". */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#020c06] to-transparent sm:hidden"
      />
    </div>
  );
}
