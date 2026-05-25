/**
 * Performance flags for the Catalyst Data Store layer.
 *
 * USE_ZCQL toggles whether controllers push filters / sort / pagination
 * down to ZCQL (fast path) or fall back to the legacy "list everything
 * + filter in JS" path. Requires the corresponding columns to be indexed
 * in the Catalyst console for the gain to be real. Default false → safe.
 */

const flag = (key: string, fallback = false): boolean => {
  const value = process.env[key];
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true' || value === '1';
};

export const USE_ZCQL = flag('USE_ZCQL');

export function useZCQL(): boolean {
  return USE_ZCQL;
}
