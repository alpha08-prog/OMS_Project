import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TextInput } from '../../components/AuthForm/Input'
import { PasswordInput } from '../../components/AuthForm/PasswordInput'
import { Checkbox } from '../../components/AuthForm/Checkbox'
import { PasswordStrengthMeter } from '../../components/AuthForm/PasswordStrengthMeter'
import { Spinner } from '../../components/AuthForm/Spinner'
import { useToast } from '../../components/AuthForm/Toast'
import { api } from '../../lib/api'
import {
  validateEmail,
  validateFullName,
  validatePhone,
  validatePassword,
  matchPasswords,
} from '../../lib/validation'

export default function Signup() {
  const navigate = useNavigate()
  const { push } = useToast()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [terms, setTerms] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const strength = useMemo(() => PasswordStrengthMeter.calculate(password), [password])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const newErrors: Record<string, string> = {}
    const nameErr = validateFullName(name)
    if (nameErr) newErrors.name = nameErr
    const emailErr = validateEmail(email)
    if (emailErr) newErrors.email = emailErr
    const phoneErr = validatePhone(phone)
    if (phoneErr) newErrors.phone = phoneErr
    const pwdErr = validatePassword(password)
    if (pwdErr) newErrors.password = pwdErr
    const matchErr = matchPasswords(password, confirm)
    if (matchErr) newErrors.confirm = matchErr
    if (!terms) newErrors.terms = 'You must accept the terms.'

    if (Object.keys(newErrors).length) {
      setErrors(newErrors)
      return
    }

    setLoading(true)
    setErrors({})

    try {
      const res = await api.signup({ name, email, phone, password })
      push({ type: 'success', title: 'Account created', message: `Welcome, ${res.user.name}` })
      navigate('/auth/login')
    } catch (err: any) {
      if (err?.status === 429) {
        push({ type: 'error', title: 'Too many attempts', message: 'Please complete captcha or try later.' })
      } else if (err?.errors) {
        setErrors(err.errors)
      } else {
        push({ type: 'error', title: 'Signup failed', message: err?.message || 'Please try again.' })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1">Create account</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">Join the OMS platform</p>

        {Object.keys(errors).length > 0 && (
          <div role="alert" className="mb-4 rounded border border-red-300 bg-red-50 text-red-700 p-3 text-sm">
            <p className="font-medium">Please fix the following:</p>
            <ul className="list-disc pl-5">
              {Object.entries(errors).map(([k, v]) => (
                <li key={k}>{v}</li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={onSubmit} noValidate>
          <div className="space-y-4">
            <TextInput id="name" label="Full name" value={name} onChange={setName} required error={errors.name} />
            <TextInput id="email" label="Email" type="email" value={email} onChange={setEmail} required error={errors.email} />
            <TextInput id="phone" label="Mobile number" value={phone} onChange={setPhone} required error={errors.phone} placeholder="10 digits" />

            <PasswordInput id="password" label="Password" value={password} onChange={setPassword} required error={errors.password} />
            <PasswordStrengthMeter score={strength.score} hints={strength.hints} />

            <PasswordInput id="confirm" label="Confirm password" value={confirm} onChange={setConfirm} required error={errors.confirm} />

            <Checkbox id="terms" label={<span>I agree to the <a className="text-primary-600 underline" href="#">terms</a></span>} checked={terms} onChange={setTerms} error={errors.terms} />

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center rounded-md bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {loading ? <Spinner /> : 'Create account'}
            </button>
          </div>
        </form>

        <p className="mt-6 text-sm text-gray-600 dark:text-gray-300">
          Already have an account?{' '}
          <Link to="/auth/login" className="text-primary-600 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
