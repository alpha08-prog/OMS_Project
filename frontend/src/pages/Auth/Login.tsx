import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TextInput } from '../../components/AuthForm/Input'
import { PasswordInput } from '../../components/AuthForm/PasswordInput'
import { Checkbox } from '../../components/AuthForm/Checkbox'
import { Spinner } from '../../components/AuthForm/Spinner'
import { useToast } from '../../components/AuthForm/Toast'
import { authApi } from '../../lib/api'
import GovernmentHeroSection from '../../components/GovernmentHeroSection'
import portrait from '../../assets/prahlad_joshi1.jpg'

// Clear all auth data on logout/session clear
function clearAuthData() {
  localStorage.removeItem('auth_token')
  localStorage.removeItem('remember_token')
  localStorage.removeItem('user')
  localStorage.removeItem('user_role')
  localStorage.removeItem('user_name')
  sessionStorage.removeItem('auth_session')
}

export default function Login() {
  const navigate = useNavigate()
  const { push } = useToast()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [errors, setErrors] = useState<{identifier?: string; password?: string; server?: string}>({})
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Clear any existing auth data when login page loads
  // This ensures no stale data from previous sessions
  useEffect(() => {
    // Only clear if there's no valid token
    const token = localStorage.getItem('auth_token')
    const session = sessionStorage.getItem('auth_session')
    
    // If user navigated to login page directly, clear old auth data
    if (!token && !session) {
      clearAuthData()
    }
    
    // If user is already logged in with valid session, redirect them
    if (token && session) {
      const role = localStorage.getItem('user_role')
      if (role === 'STAFF') {
        navigate('/staff/home', { replace: true })
      } else if (role === 'ADMIN') {
        navigate('/admin/home', { replace: true })
      } else if (role === 'SUPER_ADMIN') {
        navigate('/home', { replace: true })
      }
    }
  }, [navigate])

  // simple mount animation trigger
  if (!mounted) setTimeout(() => setMounted(true), 0)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const newErrors: typeof errors = {}

    // Simple validation for login - just check fields are not empty
    if (!identifier.trim()) {
      newErrors.identifier = 'Email or Employee ID is required'
    }

    if (!password) {
      newErrors.password = 'Password is required'
    }

    if (Object.keys(newErrors).length) {
      setErrors(newErrors)
      return
    }

    setLoading(true)
    setErrors({})

    try {
      // Clear any old auth data before new login
      clearAuthData()
      
      const res = await authApi.login({ identifier, password })
      // Store token for API calls
      if (res.token) {
        localStorage.setItem('auth_token', res.token)
        if (remember) localStorage.setItem('remember_token', 'true')
      }
      // mark session so ProtectedRoute can allow access
      sessionStorage.setItem('auth_session', '1')
      // Store user info
      localStorage.setItem('user', JSON.stringify(res.user))
      localStorage.setItem('user_role', res.user.role)  // Store role separately for sidebar
      localStorage.setItem('user_name', res.user.name)  // Store name separately for header
      push({ type: 'success', title: 'Welcome back!', message: `Hello ${res.user?.name ?? ''}` })
      
      // Navigate based on role with replace to clear history
      // This prevents back button from going to previous user's pages
      if (res.user.role === 'STAFF') {
        navigate('/staff/home', { replace: true })
      } else if (res.user.role === 'ADMIN') {
        navigate('/admin/home', { replace: true })
      } else {
        navigate('/home', { replace: true })
      }
    } catch (err: unknown) {
      const error = err as { status?: number; message?: string }
      const status = error?.status
      const message = error?.message || 'Invalid credentials'
      setErrors({ server: message })
      push({ type: 'error', title: status === 401 ? 'Invalid credentials' : 'Login failed', message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="grid min-h-screen md:grid-cols-2">
        {/* Left: Government identity section */}
        <div className="h-60 md:h-auto">
          <GovernmentHeroSection
            imageUrl={portrait}
            name="Shri Prahlad Joshi"
            currentRole=" Union Minister of Consumer Affairs, Food and Public Distribution, Government of India"
            pastRoles={[
              'Former Minister of New and Renewable Energy',
              'Former Minister of Coal and Mines',
            ]}
            constituency="Member of Parliament – Dharwad, Karnataka"
          />
        </div>

        {/* Right: Login form with light blue/grey gradient and welcome heading */}
        <div className="relative flex items-center justify-center px-3 py-4 md:py-0 bg-gradient-to-br from-slate-50 via-blue-50 to-white">
          {/* translucent layer for readability */}
          <div className={`w-full max-w-lg rounded-2xl bg-white/85 backdrop-blur-md shadow-2xl ring-1 ring-blue-100 p-4 md:p-5 transition-all duration-500 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
            <div className="mb-3">
              <p className="text-[13px] md:text-sm text-slate-800/90 leading-snug">
                <span className="font-semibold">Welcome to the official Inter-Office Management Information System (MIS)</span> of the Office of Shri Prahlad Joshi
              </p>
            </div>
            <div className="mb-3">
              <div className="flex items-center gap-3">
                <span className="inline-block h-6 w-1.5 rounded bg-amber-500" aria-hidden="true" />
                <h1 className="text-3xl font-extrabold leading-tight text-blue-900">MIS Inter-Office Login</h1>
              </div>
              <p className="mt-1 text-xs md:text-sm text-slate-600">Ministry of Consumer Affairs, Food and Public Distribution</p>
            </div>

            {errors.server && (
              <div id="form-error" role="alert" className="mb-4 rounded border border-red-300 bg-red-50 text-red-700 p-3 text-sm">
                {errors.server}
              </div>
            )}

            <form onSubmit={onSubmit} noValidate aria-describedby={errors.server ? 'form-error' : undefined}>
              <div className="space-y-2.5">
                <TextInput
                  id="identifier"
                  label="Email / Employee ID"
                  value={identifier}
                  onChange={setIdentifier}
                  placeholder="you@domain.gov.in or EMP12345"
                  autoComplete="username"
                  error={errors.identifier}
                  className="bg-gray-50 border-gray-200 placeholder:text-gray-400 focus:bg-white focus:ring-amber-600 focus:border-amber-600"
                  required
                />

                <PasswordInput
                  id="password"
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  autoComplete="current-password"
                  error={errors.password}
                  className="bg-gray-50 border-gray-200 placeholder:text-gray-400 focus:bg-white focus:ring-amber-600 focus:border-amber-600"
                  required
                />

                <div className="flex items-center justify-between">
                  <Checkbox id="remember" label="Remember me" checked={remember} onChange={setRemember} />
                  <Link to="/auth/forgot-password" className="text-sm text-blue-900 hover:underline focus:outline-none focus:ring-2 focus:ring-amber-700 rounded">
                    Forgot password?
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center rounded-md bg-gradient-to-r from-blue-900 to-indigo-900 px-4 py-2 text-white shadow-lg hover:shadow-xl hover:from-blue-800 hover:to-indigo-900 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-amber-600 transition-transform duration-150 will-change-transform hover:-translate-y-px active:translate-y-[1px]"
                >
                  {loading ? <Spinner /> : 'Login'}
                </button>
              </div>
            </form>

            
          </div>
        </div>
      </div>
    </div>
  )
  
}
