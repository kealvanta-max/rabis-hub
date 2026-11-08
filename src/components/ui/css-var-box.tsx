"use client";

import { useRef, type ElementType, type ReactNode } from "react";
import { useCssVars, type CssVars } from "@/lib/css-vars";

/**
 * The CSP-safe replacement for a `style` prop.
 *
 * Production blocks style attributes (`style-src-attr 'none'`), and React's
 * `style` prop compiles to exactly that: an attribute. Verified in a headless
 * Chrome against the real policy, three ways:
 *
 *   <div style="width:77px">                       -> computed width 784px (blocked)
 *   el.setAttribute("style", "width:33px")         -> blocked (what React does)
 *   el.style.width = "22px"                        -> 22px (allowed)
 *   el.style.setProperty("--w", "11px")            -> allowed
 *
 * The CSSOM is not covered by CSP, only markup is. So this component takes
 * custom properties, writes them through the CSSOM, and lets a utility class
 * consume them:
 *
 *   <CssVarBox vars={{ "--bar": `${pct}%` }} className="h-full w-[var(--bar)]" />
 *
 * The point of the wrapper rather than a bare ref is that a mapped list gets one
 * instance per row without eleven hand-rolled refs, and there is no way to
 * accidentally reintroduce a style attribute without `tests/cropper-csp` failing.
 */
export function CssVarBox({
  as: Tag = "div",
  vars,
  className,
  children,
  ...rest
}: {
  as?: ElementType;
  vars: CssVars;
  className?: string;
  children?: ReactNode;
} & Record<string, unknown>) {
  const ref = useRef<HTMLElement>(null);
  useCssVars(ref, vars);

  return (
    <Tag ref={ref} className={className} {...rest}>
      {children}
    </Tag>
  );
}

export default CssVarBox;
