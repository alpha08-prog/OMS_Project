import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'

type UserRole = 'STAFF' | 'ADMIN' | 'SUPER_ADMIN'

interface ProtectedRouteProps {
  children: React.ReactElement
  allowedRoles?: UserRole[]
}

function hasAuth() {
  // localStorage token for "remember me" flow
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
  // session flag for httpOnly cookie session set on successful login
  const session = typeof window !== 'undefined' ? sessionStorage.getItem('auth_session') : null
  return Boolean(token || session)
}

function getUserRole(): UserRole | null {
  if (typeof window === 'undefined') return null
  
  let role = localStorage.getItem('user_role') as UserRole | null
  if (!role) {
    // Fallback: try to get from user object
    const userStr = localStorage.getItem('user')
    if (userStr) {
      try {
        const user = JSON.parse(userStr)
        role = user.role as UserRole
      } catch {
        return null
      }
    }
  }
  return role
}

function getRoleBasedDashboard(role: UserRole | null): string {
  switch (role) {
    case 'STAFF':
      return '/staff/home'
    case 'ADMIN':
      return '/admin/home'
    case 'SUPER_ADMIN':
      return '/home'
    default:
      return '/auth/login'
  }
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const location = useLocation()
  
  if (!hasAuth()) {
    return <Navigate to="/auth/login" replace />
  }
  
  const userRole = getUserRole()
  
  // If allowedRoles is specified, check if user has access
  if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
    // Redirect to their appropriate dashboard
    const correctDashboard = getRoleBasedDashboard(userRole)
    return <Navigate to={correctDashboard} replace />
  }
  
  // Prevent cross-role navigation by checking current path
  const currentPath = location.pathname
  
  // Admin should not access super admin routes
  if (userRole === 'ADMIN' && currentPath === '/home') {
    return <Navigate to="/admin/home" replace />
  }
  
  // Staff should not access admin/super admin routes
  if (userRole === 'STAFF') {
    if (currentPath === '/home' || currentPath === '/admin/home' || 
        currentPath.includes('/grievances/verify') || 
        currentPath.includes('/train-eq/queue') ||
        currentPath.includes('/tour-program/pending')) {
      return <Navigate to="/staff/home" replace />
    }
  }
  
  // Super Admin can access everything
  
  return children
}

// Export utility functions for use in other components
export { getUserRole, getRoleBasedDashboard, hasAuth }
