import { useEffect, useState, useCallback } from "react";

const PREFIX = "formDraft:";

/**
 * Form draft persistence hook.
 *
 * Mirrors the useState API but transparently saves the current value to
 * sessionStorage on every change and rehydrates from it on mount. Use one
 * unique `key` per form (e.g. "office-grievance:create"). Survives page
 * refresh and same-tab navigation; cleared on tab close (sessionStorage
 * scope) or by calling the returned `clearDraft`.
 *
 * File inputs cannot be serialised — keep `File` objects in their own
 * `useState` outside this hook.
 */
export function useFormDraft<T>(
  key: string,
  initial: T
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const storageKey = PREFIX + key;

  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return initial;
      const parsed = JSON.parse(raw);
      // Merge so newly added fields use their default rather than missing
      return typeof initial === "object" && initial !== null && !Array.isArray(initial)
        ? ({ ...(initial as object), ...parsed } as T)
        : (parsed as T);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // sessionStorage can throw on quota / private mode — silently skip.
    }
  }, [storageKey, value]);

  const clearDraft = useCallback(() => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey]);

  return [value, setValue, clearDraft];
}
