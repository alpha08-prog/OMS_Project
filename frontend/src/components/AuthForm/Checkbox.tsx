type Props = {
  id: string
  label: React.ReactNode
  checked: boolean
  onChange: (v: boolean) => void
  error?: string
}

export function Checkbox({ id, label, checked, onChange, error }: Props) {
  return (
    <div>
      <label className="inline-flex items-center gap-2">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className={`h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 ${error ? 'ring-2 ring-red-500' : ''}`}
        />
        <span className="text-sm text-gray-700 dark:text-gray-200">{label}</span>
      </label>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}
