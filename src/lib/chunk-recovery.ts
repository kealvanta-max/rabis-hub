/**
 * Recovering from a stale build.
 *
 * Next.js serves JavaScript in chunks whose filenames change on every deploy. A
 * phone that has kept the app open, or that is sitting on a cached HTML document,
 * keeps asking for chunk names that no longer exist. The request 404s, the dynamic
 * import rejects, and the member sees "Something went wrong" on a step that worked
 * an hour earlier. It is not her fault and there is nothing to fix in that step:
 * the page simply needs to load the current build.
 *
 * This is a known failure mode of every long-lived tab. The fix is to notice it,
 * reload once, and never show the error to the member.
 */

const RELOAD_FLAG = "rabis-chunk-reload-at";
/** Do not reload twice inside this window, or a broken build becomes a reload loop. */
const RELOAD_COOLDOWN_MS = 60_000;

const CHUNK_ERROR =
  /ChunkLoadError|Loading chunk\s+\S+\s+failed|Loading CSS chunk\s+\S+\s+failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unexpected token '<'/i;

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const value = error as { name?: string; message?: string };
  const text = `${value.name ?? ""} ${value.message ?? ""}`;
  if (CHUNK_ERROR.test(text)) return true;

  // Some Android browsers reject a dynamic import with an empty TypeError. The
  // stack still names the failing chunk.
  const stack = (error as { stack?: string }).stack ?? "";
  return /_next\/static\/chunks/.test(stack) && /fetch|import|load/i.test(text);
}

/**
 * Reloads the page once when the failure is a build mismatch.
 * Returns true when a reload was started, so the caller can stay quiet.
 */
export function recoverFromStaleBuild(error: unknown): boolean {
  if (typeof window === "undefined" || !isChunkLoadError(error)) return false;

  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_FLAG) ?? 0);
    if (Number.isFinite(last) && Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    window.sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    /* storage blocked: fall through and reload, the cooldown is only a guard */
  }

  try {
    // `replace` keeps the back button working: no history entry for the bad load.
    window.location.replace(window.location.href);
  } catch {
    window.location.reload();
  }

  return true;
}
