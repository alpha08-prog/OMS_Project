import React from 'react'
import { Navigate } from 'react-router-dom'

function hasAuth() {
  // localStorage token for "remember me" flow
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
  // session flag for httpOnly cookie session set on successful login
  const session = typeof window !== 'undefined' ? sessionStorage.getItem('auth_session') : null
  return Boolean(token || session)
}

export default function ProtectedRoute({ children }: { children: React.ReactElement }) {
  if (!hasAuth()) {
    return <Navigate to="/auth/login" replace />
  }
  return children
}
