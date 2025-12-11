import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spinner } from '../../components/AuthForm/Spinner'

export default function OTP() {
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(otp)) return
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      navigate('/dashboard')
    }, 800)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1">Enter 2FA Code</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">Check your authenticator app or SMS/email.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <input
            inputMode="numeric"
            pattern="\\d{6}"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
            className="w-full tracking-widest text-center text-lg rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="••••••"
            aria-label="One-time passcode"
          />
          <button
            type="submit"
            disabled={loading || !/^\d{6}$/.test(otp)}
            className="inline-flex w-full items-center justify-center rounded-md bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {loading ? <Spinner /> : 'Verify'}
          </button>
        </form>
      </div>
    </div>
  )
}
