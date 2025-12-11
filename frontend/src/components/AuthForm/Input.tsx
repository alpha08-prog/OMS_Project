import type { ComponentProps } from 'react'

type Props = {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
} & Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'id'>

export function TextInput({ id, label, value, onChange, error, className = '', ...rest }: Props) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{label}</label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`w-full rounded-md border px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 ${error ? 'border-red-500' : 'border-gray-300 dark:border-gray-700'} ${className}`}
        {...rest}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}
