import { create } from 'zustand'
import type { User } from '../lib/api'

type AuthState = {
  user: User | null
  token?: string
  setAuth: (user: User | null, token?: string) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>((set: (partial: Partial<AuthState>) => void) => ({
  user: null,
  token: undefined,
  setAuth: (user, token) => set({ user, token }),
  clear: () => set({ user: null, token: undefined }),
}))
