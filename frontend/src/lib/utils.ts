// Lightweight classnames combiner to avoid extra deps
export type ClassValue = string | number | null | undefined | false | Record<string, boolean> | ClassValue[]

function toClassName(v: ClassValue): string {
  if (!v) return ''
  if (typeof v === 'string' || typeof v === 'number') return String(v)
  if (Array.isArray(v)) return v.map(toClassName).filter(Boolean).join(' ')
  if (typeof v === 'object') return Object.entries(v).filter(([, ok]) => !!ok).map(([k]) => k).join(' ')
  return ''
}

export function cn(...inputs: ClassValue[]) {
  return inputs.map(toClassName).filter(Boolean).join(' ').trim().replace(/\s+/g, ' ')
}
