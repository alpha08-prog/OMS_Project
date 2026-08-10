/**
 * Side-effect module: load .env BEFORE anything else reads process.env.
 *
 * This exists because of a bug that was invisible for as long as it existed.
 * `app.ts` imported `./routes` on line 5 but called `dotenv.config()` on line
 * 13 — and ES module imports are hoisted and evaluated first. So every module
 * pulled in through the route tree ran against an EMPTY process.env.
 *
 * `config/feature-flags.ts` reads its flags at MODULE SCOPE:
 *
 *     export const USE_ZCQL = flag('USE_ZCQL');   // evaluated at import time
 *
 * which meant `.env` could say `USE_ZCQL=true` and the running process would
 * still resolve it as `false` — verified from the boot log:
 *
 *     .env:49   USE_ZCQL=true
 *     [boot]    useZCQL=false
 *
 * Nothing errored. The flag simply never took effect, so the "fast" ZCQL
 * branches were dead code and every list quietly ran the full-table-scan
 * fallback. A config value that silently does nothing is worse than one that
 * fails loudly: someone set it, believed it, and moved on.
 *
 * IMPORT THIS FIRST IN app.ts, ABOVE EVERY OTHER IMPORT. Its only job is the
 * side effect, and its position in the import list is the whole point — an
 * import re-order is enough to reintroduce the bug, which is why
 * `assertEnvLoadedBeforeFlags()` below exists and why app.ts logs the resolved
 * value at boot.
 */
import dotenv from 'dotenv';

dotenv.config();

/** True once this module has run. Used to catch a bad import order. */
export const ENV_LOADED = true;

/**
 * Fail loudly if a flag was resolved before .env was read.
 *
 * Compares what `feature-flags` computed at import time against what the
 * environment actually says now. They can only disagree if the flag module was
 * evaluated first — the exact regression this file prevents.
 */
export function assertEnvLoadedBeforeFlags(
  resolved: Record<string, boolean>
): void {
  const truthy = (v: string | undefined): boolean =>
    v !== undefined && (v.toLowerCase() === 'true' || v === '1');

  for (const [key, value] of Object.entries(resolved)) {
    const fromEnv = truthy(process.env[key]);
    if (fromEnv !== value) {
      throw new Error(
        `Boot order regression: ${key} resolved to ${value} but the environment ` +
          `says ${fromEnv}. A module read process.env before config/load-env ran — ` +
          `make sure "import './config/load-env'" is the FIRST import in app.ts.`
      );
    }
  }
}
