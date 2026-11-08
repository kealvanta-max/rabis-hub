/**
 * Stand-in for the `server-only` marker package.
 *
 * Next.js resolves this to a module that throws if it is ever bundled for the
 * browser. Under Vitest everything already runs in Node, so the marker has no
 * meaning and would only block the import. The real guard is enforced by the
 * framework at build time, and additionally by `tests/security-guardrails`
 * checking that these modules are never imported from a client component.
 */
export {};
