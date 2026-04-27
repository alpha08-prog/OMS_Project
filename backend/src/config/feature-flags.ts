/**
 * Feature flags — used during the Prisma → Catalyst Data Store migration.
 *
 * Set USE_CATALYST=true in .env to route requests through the Catalyst-backed
 * controllers. Default (false) keeps the existing Prisma + Neon behavior.
 *
 * Per-module flags let us migrate one module at a time and roll back instantly.
 */

const flag = (key: string, fallback = false): boolean => {
  const value = process.env[key];
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true' || value === '1';
};

/** Master switch — when true, all migrated modules use Catalyst. */
export const USE_CATALYST = flag('USE_CATALYST');

/** Per-module overrides. A module uses Catalyst if either USE_CATALYST or its own flag is true. */
export const featureFlags = {
  visitor: flag('USE_CATALYST_VISITOR') || USE_CATALYST,
  grievance: flag('USE_CATALYST_GRIEVANCE') || USE_CATALYST,
  trainRequest: flag('USE_CATALYST_TRAIN') || USE_CATALYST,
  tourProgram: flag('USE_CATALYST_TOUR') || USE_CATALYST,
  task: flag('USE_CATALYST_TASK') || USE_CATALYST,
  news: flag('USE_CATALYST_NEWS') || USE_CATALYST,
  birthday: flag('USE_CATALYST_BIRTHDAY') || USE_CATALYST,
  auth: flag('USE_CATALYST_AUTH') || USE_CATALYST,
  stats: flag('USE_CATALYST_STATS') || USE_CATALYST,
  history: flag('USE_CATALYST_HISTORY') || USE_CATALYST,
  pdf: flag('USE_CATALYST_PDF') || USE_CATALYST,
} as const;

export type ModuleName = keyof typeof featureFlags;

/** Returns true if the named module should use Catalyst. */
export function useCatalyst(module: ModuleName): boolean {
  return featureFlags[module];
}

/** Logs the active feature-flag state at startup so the deployed config is visible. */
export function logFeatureFlags(): void {
  const enabled = (Object.keys(featureFlags) as ModuleName[]).filter(
    (m) => featureFlags[m]
  );
  if (enabled.length === 0) {
    console.log('[feature-flags] All modules: Prisma (Neon)');
  } else {
    console.log(`[feature-flags] Catalyst-backed modules: ${enabled.join(', ')}`);
    console.log(`[feature-flags] Prisma-backed modules: ${
      (Object.keys(featureFlags) as ModuleName[])
        .filter((m) => !featureFlags[m])
        .join(', ') || 'none'
    }`);
  }
}
