import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'

type UserRole = 'STAFF' | 'ADMIN' | 'SUPER_ADMIN'

interface ProtectedRouteProps {
  children: React.ReactElement
  allowedRoles?: UserRole[]
}

function hasAuth() {
  if (typeof window === 'undefined') return false
  // Check sessionStorage first (tab-specific), then localStorage
  const sessionToken = sessionStorage.getItem('auth_token')
  const localToken = localStorage.getItem('auth_token')
  const localSession = localStorage.getItem('auth_session')
  const sessionSession = sessionStorage.getItem('auth_session')
  return Boolean(sessionToken || (localToken && (sessionSession || localSession)))
}

function getUserRole(): UserRole | null {
  if (typeof window === 'undefined') return null
  
  // Get role from sessionStorage first (tab-specific), then localStorage
  let role = sessionStorage.getItem('user_role') as UserRole | null
  if (!role) {
    role = localStorage.getItem('user_role') as UserRole | null
  }
  if (!role) {
    const userStr = sessionStorage.getItem('user') || localStorage.getItem('user')
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
  
  // Get auth state synchronously - no need for state/effects which cause re-render issues
  const isAuthenticated = hasAuth()
  const userRole = getUserRole()
  
  // Check authentication first
  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />
  }
  
  // If allowedRoles is specified, check if user has access
  if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
    // User doesn't have access to this route - redirect to their dashboard
    // Use replace: false to allow back button to work
    const correctDashboard = getRoleBasedDashboard(userRole)
    console.warn(`Access denied: User role ${userRole} cannot access route ${location.pathname}. Redirecting to ${correctDashboard}`)
    // Don't use replace: true - this allows user to go back if they accidentally clicked
    return <Navigate to={correctDashboard} />
  }
  
  // Super Admin can access everything - no additional checks needed
  if (userRole === 'SUPER_ADMIN') {
    return children
  }
  
  // For ADMIN and STAFF, only check if they're trying to access routes explicitly restricted to other roles
  // Don't redirect if the route is in their allowedRoles or has no role restriction
  const currentPath = location.pathname
  
  // Admin should not access super admin-only routes
  if (userRole === 'ADMIN') {
    if (currentPath === '/home') {
      return <Navigate to="/admin/home" />
    }
    // Admin can access admin routes and common routes - let them through
    return children
  }
  
  // Staff should not access admin/super admin-only routes
  if (userRole === 'STAFF') {
    // Only redirect if trying to access explicitly admin/super admin routes
    const adminOnlyRoutes = [
      '/home',
      '/admin/home',
      '/admin/action-center',
      '/admin/task-tracker',
      '/admin/print-center',
      '/admin/history',
      '/grievances/verify',
      '/train-eq/queue',
      '/tour-program/pending',
    ]
    
    if (adminOnlyRoutes.includes(currentPath) || 
        currentPath.startsWith('/admin/')) {
      console.warn(`Access denied: Staff cannot access route ${currentPath}. Redirecting to /staff/home`)
      return <Navigate to="/staff/home" />
    }
    // Staff can access staff routes and common routes - let them through
    return children
  }
  
  return children
}

// Export utility functions for use in other components
export { getUserRole, getRoleBasedDashboard, hasAuth }
