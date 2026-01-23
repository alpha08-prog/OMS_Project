/**
 * Storage utility for authentication
 * Uses sessionStorage for token (tab-specific) to allow different users in different tabs
 * Uses localStorage for "remember me" persistence
 */

/**
 * Store user data for UI display (tab-specific using sessionStorage)
 */
export function setUserData(user: { id: string; name: string; email: string; role: string }): void {
  // Store in sessionStorage (tab-specific)
  sessionStorage.setItem('user', JSON.stringify(user));
  sessionStorage.setItem('user_role', user.role);
  sessionStorage.setItem('user_name', user.name);
  sessionStorage.setItem('user_id', user.id);
}

/**
 * Get user data from storage (tab-specific)
 */
export function getUserData(): { id: string; name: string; email: string; role: string } | null {
  // Try sessionStorage first (tab-specific)
  let userStr = sessionStorage.getItem('user');
  if (!userStr) {
    // Fallback to localStorage for backward compatibility
    userStr = localStorage.getItem('user');
  }
  if (userStr) {
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Get user role from storage (tab-specific)
 */
export function getUserRole(): string | null {
  // Try sessionStorage first (tab-specific)
  let role = sessionStorage.getItem('user_role');
  if (!role) {
    // Fallback to localStorage
    role = localStorage.getItem('user_role');
  }
  return role;
}

/**
 * Get user name from storage (tab-specific)
 */
export function getUserName(): string | null {
  let name = sessionStorage.getItem('user_name');
  if (!name) {
    name = localStorage.getItem('user_name');
  }
  return name;
}

/**
 * Clear user data from storage
 */
export function clearUserData(): void {
  // Clear sessionStorage (tab-specific)
  sessionStorage.removeItem('user');
  sessionStorage.removeItem('user_role');
  sessionStorage.removeItem('user_name');
  sessionStorage.removeItem('user_id');
  
  // Clear localStorage too
  localStorage.removeItem('user');
  localStorage.removeItem('user_role');
  localStorage.removeItem('user_name');
  localStorage.removeItem('user_id');
}

/**
 * Set auth token in storage (tab-specific using sessionStorage)
 */
export function setAuthToken(token: string): void {
  // Store in sessionStorage (tab-specific - different tabs can have different tokens)
  sessionStorage.setItem('auth_token', token);
}

/**
 * Get auth token from storage (tab-specific)
 */
export function getAuthToken(): string | null {
  // Try sessionStorage first (tab-specific)
  let token = sessionStorage.getItem('auth_token');
  if (!token) {
    // Fallback to localStorage for "remember me" functionality
    token = localStorage.getItem('auth_token');
  }
  return token;
}

/**
 * Clear auth token from storage
 */
export function clearAuthToken(): void {
  sessionStorage.removeItem('auth_token');
  localStorage.removeItem('auth_token');
}

/**
 * Get current tab ID (for backward compatibility - returns empty string)
 */
export function getCurrentTabId(): string {
  return '';
}
