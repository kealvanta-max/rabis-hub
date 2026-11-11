"use client";

import { ReactNode, useEffect, useId, useRef } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxWidth?: string;
}

export default function Modal({ isOpen, onClose, title, children, maxWidth = "max-w-lg" }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  /*
   * Escape closes, focus moves into the panel, Tab stays inside it, and closing
   * returns focus to whatever opened the dialog.
   *
   * The panel is `aria-modal="true"`, which tells a screen reader the rest of
   * the page is inert. It does not make that true for the keyboard: without the
   * trap, Tab walks out of the dialog and into the navigation behind a darkened
   * overlay, where a keyboard user cannot see where they are. That is the
   * "focus not contained" failure, and it is the most common way a custom
   * dialog fails an audit.
   *
   * Restoring focus matters as much. The admin review screen opens this from a
   * list of members; closing it used to drop focus to the top of the document,
   * so reviewing twenty members meant tabbing back twenty times.
   */
  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () => {
      const panel = panelRef.current;
      if (!panel) return [] as HTMLElement[];
      return Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null || element === panel);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    const timer = window.setTimeout(() => {
      const items = focusables();
      // Prefer the first real control; the panel is the fallback for a dialog
      // that is only text, and it still keeps the reader inside the content.
      (items[0] ?? panelRef.current)?.focus();
    }, 30);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(timer);
      // Returning focus to a removed element would throw it away, so check.
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`relative ${maxWidth} max-h-[92dvh] w-full overflow-hidden rounded-t-3xl border border-white/10 bg-navy-light shadow-2xl outline-none sm:rounded-2xl`}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
            <h3 id={titleId} className="font-grotesk text-base font-semibold text-white sm:text-lg">{title}</h3>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
              aria-label="Close dialog"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="max-h-[calc(92dvh-4.5rem)] overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
