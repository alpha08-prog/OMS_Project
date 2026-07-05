/**
 * Single source of truth for clearing auth state from browser storage.
 *
 * Previously the same key list was hand-duplicated in three logout / session
 * paths (Login, DashboardSidebar, DashboardHeader); if one drifted, a stale
 * key could linger and keep a "logged out" user partially authenticated.
 * Everyone calls this instead. Removing a key that isn't present is a no-op,
 * so clearing from both storages is safe regardless of where it was written.
 */
const AUTH_KEYS = [
  "auth_token",
  "auth_session",
  "user",
  "user_role",
  "user_name",
  "user_id",
  "remember_token",
] as const;

export function clearAuthStorage(): void {
  for (const key of AUTH_KEYS) {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  }
}
