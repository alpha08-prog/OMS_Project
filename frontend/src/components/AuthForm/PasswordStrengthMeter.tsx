type Props = { score: number; hints: string[] }

export function PasswordStrengthMeter({ score, hints }: Props) {
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500']
  const normalized = Math.min(Math.max(score, 0), 4)
  return (
    <div aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[0,1,2,3].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded ${i < normalized ? colors[Math.max(0, normalized-1)] : 'bg-gray-200 dark:bg-gray-700'}`}></div>
        ))}
      </div>
      {hints.length > 0 && (
        <ul className="mt-1 text-xs text-gray-600 dark:text-gray-300 list-disc pl-4">
          {hints.map((h) => <li key={h}>{h}</li>)}
        </ul>
      )}
    </div>
  )
}

PasswordStrengthMeter.calculate = function(pwd: string) {
  let score = 0
  const hints: string[] = []
  if (pwd.length >= 8) score++
  else hints.push('At least 8 characters')
  if (/[A-Z]/.test(pwd)) score++
  else hints.push('Add an uppercase letter')
  if (/[a-z]/.test(pwd)) score++
  else hints.push('Add a lowercase letter')
  if (/[0-9]/.test(pwd)) score++
  else hints.push('Add a number')
  if (/[^A-Za-z0-9]/.test(pwd)) score++
  else hints.push('Add a special character')
  score = Math.min(score, 4)
  return { score, hints }
}
