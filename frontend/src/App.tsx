import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Auth/Login.tsx'
import Signup from './pages/Auth/Signup.tsx'
import ForgotPassword from './pages/Auth/ForgotPassword.tsx'
import OTP from './pages/Auth/OTP.tsx'
import Home from './pages/Home.tsx'
import ProtectedRoute from './components/auth/ProtectedRoute'
import './index.css'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/auth/login" replace />} />
      <Route path="/auth/login" element={<Login />} />
      <Route path="/auth/signup" element={<Signup />} />
      <Route path="/auth/forgot-password" element={<ForgotPassword />} />
      <Route path="/auth/otp" element={<OTP />} />
      <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/auth/login" replace />} />
    </Routes>
  )
}
