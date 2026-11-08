"use client";

import { useLayoutEffect, type CSSProperties, type RefObject } from "react";

/**
 * Drive CSS from JavaScript without inline style attributes.
 *
 * The production Content Security Policy blocks `style` attributes
 * (`style-src-attr 'none'`), which is the right default: it removes a whole
 * class of style-injection attacks. But React's `style` prop compiles to an
 * inline attribute, so every percentage-width bar, avatar size or animated
 * transform silently vanished in production while looking perfect in a local
 * dev session with the CSP off.
 *
 * CSS custom properties are not style attributes, and assigning them through
 * the CSSOM is not blocked by CSP. So a component that needs a runtime value
 * writes it here and reads it from a class:
 *
 *   useCssVars(ref, { "--bar-w": `${percent}%` })   // JS -> CSSOM
 *   <div className="w-[var(--bar-w)]" ref={ref} />  // CSS consumes it
 *
 * The values are written in a layout effect so the first paint after hydration
 * already uses them, and the cleanup removes them so a remount never inherits a
 * stale value.
 */

/** CSS custom properties only: a plain object would invite style attributes. */
export type CssVars = Record<`--${string}`, string | number | null | undefined>;

const pending = new WeakMap<Element, CssVars>();

/** Failures here must never break a render: the CSS fallback still applies. */
function apply(element: Element, vars: CssVars) {
  const style = (element as HTMLElement).style;
  if (!style) return;
  for (const [name, raw] of Object.entries(vars)) {
    const value = raw === null || raw === undefined ? "" : String(raw);
    if (value) style.setProperty(name, value);
    else style.removeProperty(name);
  }
}

export function setCssVars(element: Element | null, vars: CssVars) {
  if (!element) return;
  pending.set(element, vars);
  apply(element, vars);
}

export function useCssVars<T extends Element>(
  ref: RefObject<T | null>,
  vars: CssVars,
  deps: unknown[] = []
) {
  // Serialised so a fresh object literal with identical values does not thrash
  // the DOM on every render.
  const signature = JSON.stringify(vars);

  useLayoutEffect(() => {
    apply(ref.current ?? document.documentElement, vars);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, ...deps]);
}

/**
 * A `style` prop replacement for components that cannot use a ref (a mapped
 * child, a third-party wrapper). Returns props to spread; they never include a
 * `style` attribute, so CSP is satisfied by construction.
 */
export function cssVarProps(vars: CssVars): { "data-css-vars": string } {
  return { "data-css-vars": JSON.stringify(vars) };
}

/** Type helper so callers can build a partial style object of only variables. */
export type CssVarStyle = CSSProperties & Record<`--${string}`, string | number>;
