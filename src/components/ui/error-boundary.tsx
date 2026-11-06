"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { recoverFromStaleBuild } from "@/lib/chunk-recovery";
import { captureException } from "@/lib/monitoring";

interface Props {
  children: ReactNode;
  /**
   * Rendered instead of the children when they throw. A function receives the
   * error and a reset, so a fallback can offer "try that again" without a reload.
   */
  fallback: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  /** Shows up in the console and in Sentry, so the cause is findable later. */
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * Keeps one broken widget from taking down the whole page.
 *
 * The signup form is five steps long and step three mounts a camera, a WebGL
 * scene and a face model, none of which we control. When any of them threw, React
 * unwound to `app/error.tsx` and the member lost the entire form, including the
 * documents she had just photographed. A decorative animation must never be able
 * to do that, so the risky pieces render inside this instead.
 *
 * A chunk that 404s after a redeploy is handled before the member sees anything:
 * that is a stale page, not a broken step, and one reload fixes it.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label ?? "ui"}] render failed:`, error, info.componentStack);
    captureException(error, { boundary: this.props.label ?? "ui" });

    // A build mismatch repairs itself; do not spend the member's patience on it.
    recoverFromStaleBuild(error);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) {
      const { fallback } = this.props;
      return typeof fallback === "function" ? fallback(error, this.reset) : fallback;
    }

    return this.props.children;
  }
}
