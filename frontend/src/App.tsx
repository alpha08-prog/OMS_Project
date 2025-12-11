import { Routes, Route, Navigate, Link } from 'react-router-dom'
import Login from './pages/Auth/Login.tsx'
import Signup from './pages/Auth/Signup.tsx'
import ForgotPassword from './pages/Auth/ForgotPassword.tsx'
import OTP from './pages/Auth/OTP.tsx'
import './index.css'

function Dashboard() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-xl w-full bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-300 mt-2">You are signed in. Replace with OMS dashboard.</p>
        <div className="mt-6 text-sm">
          <Link to="/auth/login" className="text-primary-600 hover:underline">Back to Login</Link>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/auth/login" replace />} />
      <Route path="/auth/login" element={<Login />} />
      <Route path="/auth/signup" element={<Signup />} />
      <Route path="/auth/forgot-password" element={<ForgotPassword />} />
      <Route path="/auth/otp" element={<OTP />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="*" element={<Navigate to="/auth/login" replace />} />
    </Routes>
  )
}
