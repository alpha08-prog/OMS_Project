import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TextInput } from '../../components/AuthForm/Input'
import { PasswordInput } from '../../components/AuthForm/PasswordInput'
import { Checkbox } from '../../components/AuthForm/Checkbox'
import { Spinner } from '../../components/AuthForm/Spinner'
import { useToast } from '../../components/AuthForm/Toast'
import { api } from '../../lib/api'
import { validateIdentifier, validatePassword } from '../../lib/validation'

export default function Login() {
  const navigate = useNavigate()
  const { push } = useToast()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [errors, setErrors] = useState<{identifier?: string; password?: string; server?: string}>({})
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const newErrors: typeof errors = {}

    const idErr = validateIdentifier(identifier)
    if (idErr) newErrors.identifier = idErr

    const pwdErr = validatePassword(password)
    if (pwdErr) newErrors.password = pwdErr

    if (Object.keys(newErrors).length) {
      setErrors(newErrors)
      return
    }

    setLoading(true)
    setErrors({})

    try {
      const res = await api.login({ identifier, password })
      // token storage note: prefer httpOnly cookies server-side
      if (res.token && remember) localStorage.setItem('auth_token', res.token)
      push({ type: 'success', title: 'Welcome back!', message: `Hello ${res.user?.name ?? ''}` })
      navigate('/dashboard')
    } catch (err: any) {
      const status = err?.status
      const message = err?.message || 'Invalid credentials'
      setErrors({ server: message })
      push({ type: 'error', title: status === 401 ? 'Invalid credentials' : 'Login failed', message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1">Sign in</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">Welcome to OMS. Admins may be prompted for 2FA.</p>

        {errors.server && (
          <div role="alert" className="mb-4 rounded border border-red-300 bg-red-50 text-red-700 p-3 text-sm">
            {errors.server}
          </div>
        )}

        <form onSubmit={onSubmit} noValidate aria-describedby={errors.server ? 'form-error' : undefined}>
          <div className="space-y-4">
            <TextInput
              id="identifier"
              label="Email or Mobile"
              value={identifier}
              onChange={setIdentifier}
              placeholder="you@example.com or 9876543210"
              autoComplete="username"
              error={errors.identifier}
              required
            />

            <PasswordInput
              id="password"
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              error={errors.password}
              required
            />

            <div className="flex items-center justify-between">
              <Checkbox id="remember" label="Remember me" checked={remember} onChange={setRemember} />
              <Link to="/auth/forgot-password" className="text-sm text-primary-600 hover:underline focus:outline-none focus:ring-2 focus:ring-primary-500 rounded">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center rounded-md bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {loading ? <Spinner /> : 'Sign in'}
            </button>
          </div>
        </form>

        <p className="mt-6 text-sm text-gray-600 dark:text-gray-300">
          Don&apos;t have an account?{' '}
          <Link to="/auth/signup" className="text-primary-600 hover:underline">Create one</Link>
        </p>
      </div>
    </div>
  )
}
