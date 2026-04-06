import axios, { type AxiosError, type AxiosResponse } from 'axios'

// ===========================================
// Types
// ===========================================

export type UserRole = 'STAFF' | 'ADMIN' | 'SUPER_ADMIN'

export type User = {
  id: string
  name: string
  email: string
  phone?: string
  role: UserRole
}

// Auth Types
export type SignupRequest = { name: string; email: string; phone?: string; password: string }
export type SignupResponse = { user: User; token: string }

export type LoginRequest = { identifier: string; password: string }
export type LoginResponse = { user: User; token: string }

// Grievance Types
export type GrievanceType = 'WATER' | 'ROAD' | 'POLICE' | 'HEALTH' | 'TRANSFER' | 'FINANCIAL_AID' | 'ELECTRICITY' | 'EDUCATION' | 'HOUSING' | 'OTHER'
export type GrievanceStatus = 'OPEN' | 'IN_PROGRESS' | 'VERIFIED' | 'RESOLVED' | 'REJECTED'
export type ActionRequired = 'GENERATE_LETTER' | 'CALL_OFFICIAL' | 'FORWARD_TO_DEPT' | 'SCHEDULE_MEETING' | 'NO_ACTION'

export type Grievance = {
  id: string
  petitionerName: string
  mobileNumber: string
  constituency: string
  grievanceType: GrievanceType
  description: string
  monetaryValue?: number
  actionRequired: ActionRequired
  letterTemplate?: string
  referencedBy?: string
  attachmentPath?: string
  status: GrievanceStatus
  isVerified: boolean
  createdAt: string
  verifiedAt?: string
  createdBy: { id: string; name: string; email: string }
  createdById?: string
  verifiedBy?: { id: string; name: string; email: string }
}

export type CreateGrievanceRequest = {
  petitionerName: string
  mobileNumber: string
  constituency: string
  grievanceType: GrievanceType
  description: string
  monetaryValue?: number
  actionRequired?: ActionRequired
  letterTemplate?: string
  referencedBy?: string
}

// Visitor Types
export type Visitor = {
  id: string
  name: string
  designation: string
  phone?: string
  dob?: string
  purpose: string
  referencedBy?: string
  visitDate: string
  createdAt: string
  createdBy: { id: string; name: string; email: string }
}

export type CreateVisitorRequest = {
  name: string
  designation: string
  phone?: string
  dob?: string
  purpose: string
  referencedBy?: string
}

// News Types
export type NewsPriority = 'NORMAL' | 'HIGH' | 'CRITICAL'
export type NewsCategory = string // Backend accepts any string for flexibility

export type NewsIntelligence = {
  id: string
  headline: string
  category: string
  priority: NewsPriority
  mediaSource: string
  region: string
  description?: string
  imageUrl?: string
  referencedBy?: string
  createdAt: string
  createdBy: { id: string; name: string; email: string }
}

export type CreateNewsRequest = {
  headline: string
  category: string
  priority?: NewsPriority
  mediaSource: string
  region: string
  description?: string
  imageUrl?: string
  referencedBy?: string
}

// Train Request Types
export type TrainRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'RESOLVED'

export type TrainRequest = {
  id: string
  passengerName: string
  pnrNumber: string
  contactNumber?: string
  trainName?: string
  trainNumber?: string
  journeyClass: string
  dateOfJourney: string
  fromStation: string
  toStation: string
  route?: string
  quota?: string
  numberOfPassengers?: number
  remarks?: string
  referencedBy?: string
  status: TrainRequestStatus
  createdAt: string
  approvedAt?: string
  createdBy: { id: string; name: string; email: string }
  createdById?: string
  approvedBy?: { id: string; name: string; email: string }
}

export type CreateTrainRequestRequest = {
  passengerName: string
  pnrNumber: string
  contactNumber?: string
  trainName?: string
  trainNumber?: string
  journeyClass: string
  dateOfJourney: string
  fromStation: string
  toStation: string
  route?: string
  referencedBy?: string
}

// Tour Program Types
export type TourProgramDecision = 'ACCEPTED' | 'REGRET' | 'PENDING'
export type TourDecision = TourProgramDecision // alias for backward compatibility

export type TourProgram = {
  id: string
  eventName: string
  organizer: string
  organizerPhone?: string
  organizerEmail?: string
  contactPerson?: string
  contactNumber?: string
  dateTime: string  // Backend field name
  eventDate?: string  // Alias for compatibility
  venue: string
  venueLink?: string
  description?: string
  notes?: string
  referencedBy?: string
  decision: TourProgramDecision
  decisionNote?: string
  // Post-event report fields
  isCompleted?: boolean
  completedAt?: string
  driveLink?: string
  keynotes?: string
  attendeesCount?: number
  outcomeSummary?: string
  mediaLink?: string
  completedBy?: { id: string; name: string; email: string }
  createdAt: string
  createdBy: { id: string; name: string; email: string }
  createdById?: string
}

export type CreateTourProgramRequest = {
  eventName: string
  organizer: string
  organizerPhone?: string
  organizerEmail?: string
  dateTime: string  // Backend expects dateTime, not eventDate
  venue: string
  venueLink?: string
  description?: string
  referencedBy?: string
  // Note: Staff cannot set decision - it defaults to PENDING and is set by Admin
}

// Birthday Types
export type Birthday = {
  id: string
  name: string
  phone?: string
  dob: string
  relation: string
  notes?: string
  createdAt: string
  createdBy?: { id: string; name: string; email: string }
}

export type CreateBirthdayRequest = {
  name: string
  phone?: string
  dob: string
  relation: string
  notes?: string
}

// History Types
export type HistoryItemType = 'GRIEVANCE' | 'TRAIN_REQUEST' | 'TOUR_PROGRAM'

export type HistoryItem = {
  id: string
  type: HistoryItemType
  action: string
  title: string
  description: string
  actionBy: { id: string; name: string; email: string } | null
  actionAt: string
  status: string
  details: Record<string, unknown>
}

export type HistoryStats = {
  grievances: { resolved: number; rejected: number; verified?: number; inProgress?: number; total: number }
  trainRequests: { approved: number; rejected: number; resolved?: number; total: number }
  tourPrograms: { accepted: number; regret: number; total: number }
  totalActions: number
}

// Stats Types
export type DashboardStats = {
  grievances: {
    total: number
    open: number
    inProgress: number
    verified: number
    resolved: number
    pendingVerification: number
  }
  visitors: {
    total: number
    today: number
  }
  trainRequests: {
    total: number
    pending: number
    approved: number
  }
  news: {
    total: number
    critical: number
  }
  tourPrograms: {
    total: number
    upcoming: number
    pending: number
  }
  birthdays: {
    today: number
  }
}

// API Response Types
export type ApiResponse<T> = {
  success: boolean
  message: string
  data: T
  meta?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// ===========================================
// API Configuration
// ===========================================

export const API_URL = (import.meta.env.VITE_API_URL || 'https://oms-project-moep.onrender.com/api').replace(/\/$/, '')

export const http = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

// Add auth token to requests
http.interceptors.request.use((config) => {
  // Get token from sessionStorage first (tab-specific), then localStorage (remember me)
  let token = sessionStorage.getItem('auth_token')
  if (!token) {
    token = localStorage.getItem('auth_token')
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle response errors
http.interceptors.response.use(
  (res: AxiosResponse) => res,
  (error: AxiosError) => {
    const resp = error?.response
    if (resp) {
      const respData: unknown = resp.data
      const respMessage =
        respData && typeof respData === 'object' && 'message' in (respData as Record<string, unknown>)
          ? (respData as Record<string, unknown>).message
          : undefined
      const msg = typeof respMessage === 'string' && respMessage ? respMessage : 'Request failed'

      const err = new Error(msg) as Error & { status?: number } & Record<string, unknown>
      err.status = resp.status
      if (respData && typeof respData === 'object') Object.assign(err, respData)

      // Handle 401 - only redirect if we have a token (meaning it's expired/invalid)
      // Don't redirect if we're already on login page or if this is a login attempt
      if (resp.status === 401) {
        const currentPath = window.location.pathname
        const hasToken = sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token')

        // Only clear and redirect if:
        // 1. We had a token (not a login attempt)
        // 2. We're not already on auth pages
        if (hasToken && !currentPath.startsWith('/auth')) {
          // Clear sessionStorage (tab-specific)
          sessionStorage.removeItem('auth_token')
          sessionStorage.removeItem('auth_session')
          sessionStorage.removeItem('user')
          sessionStorage.removeItem('user_role')
          sessionStorage.removeItem('user_name')
          sessionStorage.removeItem('user_id')

          // Clear localStorage
          localStorage.removeItem('auth_token')
          localStorage.removeItem('remember_token')
          localStorage.removeItem('user')
          localStorage.removeItem('user_role')
          localStorage.removeItem('user_name')
          localStorage.removeItem('user_id')

          // Redirect to login
          window.location.href = '/auth/login'
        }
      }

      return Promise.reject(err)
    }
    return Promise.reject(error)
  }
)

// ===========================================
// API Methods
// ===========================================

// Auth API
export const authApi = {
  register: async (data: SignupRequest) => {
    const res = await http.post<ApiResponse<SignupResponse>>('/auth/register', data)
    return res.data.data
  },

  login: async (data: LoginRequest) => {
    const res = await http.post<ApiResponse<LoginResponse>>('/auth/login', data)
    return res.data.data
  },

  getMe: async () => {
    const res = await http.get<ApiResponse<User>>('/auth/me')
    return res.data.data
  },

  updatePassword: async (currentPassword: string, newPassword: string) => {
    const res = await http.put<ApiResponse<null>>('/auth/password', { currentPassword, newPassword })
    return res.data
  },

  getUsers: async () => {
    const res = await http.get<ApiResponse<User[]>>('/auth/users')
    return res.data.data
  },

  updateUserRole: async (userId: string, role: UserRole) => {
    const res = await http.patch<ApiResponse<User>>(`/auth/users/${userId}/role`, { role })
    return res.data.data
  },

  deactivateUser: async (userId: string) => {
    const res = await http.patch<ApiResponse<null>>(`/auth/users/${userId}/deactivate`)
    return res.data
  },
}

// Grievance API
export const grievanceApi = {
  create: async (data: CreateGrievanceRequest) => {
    const res = await http.post<ApiResponse<Grievance>>('/grievances', data)
    return res.data.data
  },

  getAll: async (params?: Record<string, string>) => {
    const res = await http.get<ApiResponse<Grievance[]>>('/grievances', { params })
    return res.data
  },

  getById: async (id: string) => {
    const res = await http.get<ApiResponse<Grievance>>(`/grievances/${id}`)
    return res.data.data
  },

  update: async (id: string, data: Partial<CreateGrievanceRequest>) => {
    const res = await http.put<ApiResponse<Grievance>>(`/grievances/${id}`, data)
    return res.data.data
  },

  verify: async (id: string) => {
    const res = await http.patch<ApiResponse<Grievance>>(`/grievances/${id}/verify`)
    return res.data.data
  },

  updateStatus: async (id: string, status: GrievanceStatus) => {
    const res = await http.patch<ApiResponse<Grievance>>(`/grievances/${id}/status`, { status })
    return res.data.data
  },

  delete: async (id: string) => {
    const res = await http.delete<ApiResponse<null>>(`/grievances/${id}`)
    return res.data
  },

  getVerificationQueue: async (params?: Record<string, string>) => {
    const res = await http.get<ApiResponse<Grievance[]>>('/grievances/queue/verification', { params })
    return res.data
  },
}

// Visitor API
export const visitorApi = {
  create: async (data: CreateVisitorRequest) => {
    const res = await http.post<ApiResponse<Visitor>>('/visitors', data)
    return res.data.data
  },

  getAll: async (params?: Record<string, string>) => {
    const res = await http.get<ApiResponse<Visitor[]>>('/visitors', { params })
    return res.data
  },

  getById: async (id: string) => {
    const res = await http.get<ApiResponse<Visitor>>(`/visitors/${id}`)
    return res.data.data
  },

  update: async (id: string, data: Partial<CreateVisitorRequest>) => {
    const res = await http.put<ApiResponse<Visitor>>(`/visitors/${id}`, data)
    return res.data.data
  },

  delete: async (id: string) => {
    const res = await http.delete<ApiResponse<null>>(`/visitors/${id}`)
    return res.data
  },

  getTodayBirthdays: async () => {
    const res = await http.get<ApiResponse<Visitor[]>>('/visitors/birthdays/today')
    return res.data.data
  },

  getByDate: async (date: string) => {
    const res = await http.get<ApiResponse<Visitor[]>>(`/visitors/date/${date}`)
    return res.data.data
  },
}

// News API
export const newsApi = {
  create: async (data: CreateNewsRequest) => {
    const res = await http.post<ApiResponse<NewsIntelligence>>('/news', data)
    return res.data.data
  },

  getAll: async (params?: Record<string, string>) => {
    const res = await http.get<ApiResponse<NewsIntelligence[]>>('/news', { params })
    return res.data
  },

  getById: async (id: string) => {
    const res = await http.get<ApiResponse<NewsIntelligence>>(`/news/${id}`)
    return res.data.data
  },

  update: async (id: string, data: Partial<CreateNewsRequest>) => {
    const res = await http.put<ApiResponse<NewsIntelligence>>(`/news/${id}`, data)
    return res.data.data
  },

  delete: async (id: string) => {
    const res = await http.delete<ApiResponse<null>>(`/news/${id}`)
    return res.data
  },

  getCriticalAlerts: async () => {
    const res = await http.get<ApiResponse<NewsIntelligence[]>>('/news/alerts/critical')
    return res.data.data
  },
}

// Train Request API
export const trainRequestApi = {
  create: async (data: CreateTrainRequestRequest) => {
    const res = await http.post<ApiResponse<TrainRequest>>('/train-requests', data)
    return res.data.data
  },

  getAll: async (params?: Record<string, string>) => {
    const res = await http.get<ApiResponse<TrainRequest[]>>('/train-requests', { params })
    return res.data
  },

  getById: async (id: string) => {
    const res = await http.get<ApiResponse<TrainRequest>>(`/train-requests/${id}`)
    return res.data.data
  },

  update: async (id: string, data: Partial<CreateTrainRequestRequest>) => {
    const res = await http.put<ApiResponse<TrainRequest>>(`/train-requests/${id}`, data)
    return res.data.data
  },

  approve: async (id: string) => {
    const res = await http.patch<ApiResponse<TrainRequest>>(`/train-requests/${id}/approve`)
    return res.data.data
  },

  reject: async (id: string, reason?: string) => {
    const res = await http.patch<ApiResponse<TrainRequest>>(`/train-requests/${id}/reject`, { reason })
    return res.data.data
  },

  resolve: async (id: string) => {
    const res = await http.patch<ApiResponse<TrainRequest>>(`/train-requests/${id}/resolve`)
    return res.data.data
  },

  delete: async (id: string) => {
    const res = await http.delete<ApiResponse<null>>(`/train-requests/${id}`)
    return res.data
  },

  getPendingQueue: async (params?: Record<string, string>) => {
    const res = await http.get<ApiResponse<TrainRequest[]>>('/train-requests/queue/pending', { params })
    return res.data
  },

  checkPNR: async (pnr: string) => {
    const res = await http.get<ApiResponse<unknown>>(`/train-requests/pnr/${pnr}`)
    return res.data.data
  },
}

// Tour Program API
export const tourProgramApi = {
  create: async (data: CreateTourProgramRequest) => {
    const res = await http.post<ApiResponse<TourProgram>>('/tour-programs', data)
    return res.data.data
  },

  getAll: async (params?: Record<string, string>) => {
    const res = await http.get<ApiResponse<TourProgram[]>>('/tour-programs', { params })
    return res.data
  },

  getById: async (id: string) => {
    const res = await http.get<ApiResponse<TourProgram>>(`/tour-programs/${id}`)
    return res.data.data
  },

  update: async (id: string, data: Partial<CreateTourProgramRequest>) => {
    const res = await http.put<ApiResponse<TourProgram>>(`/tour-programs/${id}`, data)
    return res.data.data
  },

  updateDecision: async (id: string, decision: TourDecision, decisionNote?: string) => {
    const res = await http.patch<ApiResponse<TourProgram>>(`/tour-programs/${id}/decision`, { decision, decisionNote })
    return res.data.data
  },

  delete: async (id: string) => {
    const res = await http.delete<ApiResponse<null>>(`/tour-programs/${id}`)
    return res.data
  },

  getTodaySchedule: async () => {
    const res = await http.get<ApiResponse<TourProgram[]>>('/tour-programs/schedule/today')
    return res.data.data
  },

  getUpcoming: async () => {
    const res = await http.get<ApiResponse<TourProgram[]>>('/tour-programs/upcoming')
    return res.data.data
  },

  getPending: async (params?: Record<string, string>) => {
    const res = await http.get<ApiResponse<TourProgram[]>>('/tour-programs/pending', { params })
    return res.data
  },

  // Alias for backward compatibility
  getPendingDecisions: async (params?: Record<string, string>) => {
    const res = await http.get<ApiResponse<TourProgram[]>>('/tour-programs/pending', { params })
    return res.data
  },

  getEvents: async (params?: Record<string, string>) => {
    const res = await http.get<ApiResponse<TourProgram[]>>('/tour-programs/events', { params })
    return res.data
  },

  submitEventReport: async (id: string, data: {
    driveLink?: string;
    keynotes?: string;
    attendeesCount?: number;
    outcomeSummary?: string;
    mediaLink?: string;
  }) => {
    const res = await http.patch<ApiResponse<TourProgram>>(`/tour-programs/${id}/complete`, data)
    return res.data.data
  },
}

// Stats API
export const statsApi = {
  getSummary: async () => {
    const res = await http.get<ApiResponse<DashboardStats>>('/stats/summary')
    return res.data.data
  },

  getGrievancesByType: async () => {
    const res = await http.get<ApiResponse<Array<{ type: string; count: number }>>>('/stats/grievances/by-type')
    return res.data.data
  },

  getGrievancesByStatus: async () => {
    const res = await http.get<ApiResponse<Array<{ status: string; count: number }>>>('/stats/grievances/by-status')
    return res.data.data
  },

  getGrievancesByConstituency: async () => {
    const res = await http.get<ApiResponse<Array<{ constituency: string; count: number }>>>('/stats/grievances/by-constituency')
    return res.data.data
  },

  getMonthlyTrends: async () => {
    const res = await http.get<ApiResponse<Array<{ month: string; count: number }>>>('/stats/grievances/monthly')
    return res.data.data
  },

  getMonetization: async () => {
    const res = await http.get<ApiResponse<unknown>>('/stats/monetization')
    return res.data.data
  },

  getRecentActivity: async () => {
    const res = await http.get<ApiResponse<unknown>>('/stats/recent-activity')
    return res.data.data
  },
}

// Birthday API (separate from Visitors - for dedicated birthday tracking)
export const birthdayApi = {
  create: async (data: CreateBirthdayRequest) => {
    const res = await http.post<ApiResponse<Birthday>>('/birthdays', data)
    return res.data.data
  },

  getAll: async (params?: Record<string, string>) => {
    const res = await http.get<ApiResponse<Birthday[]>>('/birthdays', { params })
    return res.data
  },

  getById: async (id: string) => {
    const res = await http.get<ApiResponse<Birthday>>(`/birthdays/${id}`)
    return res.data.data
  },

  update: async (id: string, data: Partial<CreateBirthdayRequest>) => {
    const res = await http.put<ApiResponse<Birthday>>(`/birthdays/${id}`, data)
    return res.data.data
  },

  delete: async (id: string) => {
    const res = await http.delete<ApiResponse<null>>(`/birthdays/${id}`)
    return res.data
  },

  getTodayBirthdays: async () => {
    const res = await http.get<ApiResponse<Birthday[]>>('/birthdays/today')
    return res.data.data
  },

  getUpcoming: async () => {
    const res = await http.get<ApiResponse<Birthday[]>>('/birthdays/upcoming')
    return res.data.data
  },
}

// History API (Admin actions history)
export const historyApi = {
  getHistory: async (params?: {
    type?: HistoryItemType
    action?: string
    startDate?: string
    endDate?: string
    page?: number
    limit?: number
  }) => {
    const res = await http.get<ApiResponse<HistoryItem[]>>('/history', { params })
    return res.data
  },

  getStats: async () => {
    const res = await http.get<ApiResponse<HistoryStats>>('/history/stats')
    return res.data.data
  },
}

// PDF Generation API
export const pdfApi = {
  // Download Train EQ Letter PDF (opens in new tab)
  downloadTrainEQLetter: async (id: string) => {
    try {
      console.log('Downloading TrainEQ PDF for id:', id)
      const res = await http.get(`/pdf/train-eq/${id}`, {
        responseType: 'blob',
        validateStatus: (status) => status < 500,
      })
      console.log('TrainEQ PDF - Response status:', res.status, 'Content-Type:', res.headers['content-type'])

      if (res.status >= 400) {
        try {
          const text = await res.data.text()
          const errorData = JSON.parse(text)
          throw new Error(errorData.message || `Server error: ${res.status}`)
        } catch {
          throw new Error(`Failed to generate PDF: ${res.status}`)
        }
      }

      const blob = new Blob([res.data], { type: 'application/pdf' })
      if (blob.size === 0) {
        throw new Error('PDF file is empty')
      }

      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `TrainEQ_Letter_${id}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      console.log('TrainEQ PDF download - Success')
    } catch (error: unknown) {
      console.error('PDF download error:', error)
      const errObj = error as Record<string, unknown> | null
      const errMsg = errObj && typeof errObj === 'object' && typeof errObj.message === 'string' ? errObj.message : undefined
      console.error('Error details:', errMsg)
      throw error
    }
  },

  // Preview Train EQ Letter (HTML)
  previewTrainEQLetter: async (id: string) => {
    const res = await http.get(`/pdf/train-eq/${id}/preview`, { responseType: 'text' })
    return res.data
  },

  // Download Grievance Letter PDF (opens in new tab)
  downloadGrievanceLetter: async (id: string) => {
    try {
      console.log('Downloading Grievance PDF for id:', id)
      const res = await http.get(`/pdf/grievance/${id}`, {
        responseType: 'blob',
        validateStatus: (status) => status < 500,
      })
      console.log('Grievance PDF - Response status:', res.status, 'Content-Type:', res.headers['content-type'])

      if (res.status >= 400) {
        try {
          const text = await res.data.text()
          const errorData = JSON.parse(text)
          throw new Error(errorData.message || `Server error: ${res.status}`)
        } catch {
          throw new Error(`Failed to generate PDF: ${res.status}`)
        }
      }

      const blob = new Blob([res.data], { type: 'application/pdf' })
      if (blob.size === 0) {
        throw new Error('PDF file is empty')
      }

      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `Grievance_Letter_${id}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      console.log('Grievance PDF download - Success')
    } catch (error: unknown) {
      console.error('PDF download error:', error)
      const errObj = error as Record<string, unknown> | null
      const errMsg = errObj && typeof errObj === 'object' && typeof errObj.message === 'string' ? errObj.message : undefined
      console.error('Error details:', errMsg)
      throw error
    }
  },

  // Preview Grievance Letter (HTML)
  previewGrievanceLetter: async (id: string) => {
    const res = await http.get(`/pdf/grievance/${id}/preview`, { responseType: 'text' })
    return res.data
  },

  // Download Tour Program PDF (opens in new tab)
  downloadTourProgram: async (startDate?: string, endDate?: string) => {
    try {
      const params: Record<string, string> = {}
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      const res = await http.get('/pdf/tour-program', { params, responseType: 'blob' })
      const blob = new Blob([res.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `TourProgram_${Date.now()}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('PDF download error:', error)
      throw error
    }
  },

  // Generic PDF download helper (uses axios with blob)
  downloadPDF: async (endpoint: string, filename: string) => {
    try {
      console.log('PDF download - Fetching from:', endpoint)
      const res = await http.get(endpoint, {
        responseType: 'blob',
        validateStatus: (status) => status < 500, // Don't throw on 4xx errors, we'll handle them
      })
      console.log('PDF download - Response received:', res.status, res.headers)

      // Check if response status indicates an error
      if (res.status >= 400) {
        // Try to parse error message from blob
        try {
          const text = await res.data.text()
          const errorData = JSON.parse(text)
          console.error('PDF download - Server error:', errorData)
          throw new Error(errorData.message || `Server error: ${res.status}`)
        } catch {
          throw new Error(`Failed to generate PDF: ${res.status} ${res.statusText}`)
        }
      }

      // Check content type
      const contentType = res.headers['content-type'] || ''
      if (!contentType.includes('application/pdf') && !contentType.includes('application/octet-stream')) {
        // Might be an error JSON
        try {
          const text = await res.data.text()
          const errorData = JSON.parse(text)
          throw new Error(errorData.message || 'Failed to generate PDF')
        } catch {
          throw new Error('Invalid response type from server')
        }
      }

      const blob = new Blob([res.data], { type: 'application/pdf' })
      console.log('PDF download - Blob created, size:', blob.size)

      if (blob.size === 0) {
        throw new Error('PDF file is empty')
      }

      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      console.log('PDF download - Success')
    } catch (error: unknown) {
      console.error('PDF download error:', error)
      const errObj = error as Record<string, unknown> | null
      const errMsg = errObj && typeof errObj === 'object' && typeof errObj.message === 'string' ? errObj.message : undefined
      console.error('Error details:', errMsg)
      throw error
    }
  },
}

// Task API
export type TaskStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD'
export type TaskType = 'GRIEVANCE' | 'TRAIN_REQUEST' | 'TOUR_PROGRAM' | 'GENERAL'

export type TaskAssignment = {
  id: string
  title: string
  description?: string
  taskType: TaskType
  status: TaskStatus
  priority: string
  referenceId?: string
  referenceType?: string
  progressNotes?: string
  progressPercent: number
  assignedAt: string
  dueDate?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
  assignedTo: { id: string; name: string; email: string }
  assignedBy: { id: string; name: string; email: string }
  progressHistory?: TaskProgressHistory[]
}

export type TaskProgressHistory = {
  id: string
  taskId: string
  note: string
  status?: TaskStatus
  createdAt: string
  createdBy: { id: string; name: string; email: string }
}

export type CreateTaskRequest = {
  title: string
  description?: string
  taskType: TaskType
  priority?: string
  referenceId?: string
  referenceType?: string
  assignedToId: string
  dueDate?: string
}

export type TaskTrackingData = {
  summary: {
    total: number
    assigned: number
    inProgress: number
    completed: number
    onHold: number
  }
  staffTaskCounts: Array<{
    staff: { id: string; name: string; email: string }
    pendingTasks: number
  }>
  recentActivity: TaskAssignment[]
}

export const taskApi = {
  create: async (data: CreateTaskRequest) => {
    const res = await http.post<ApiResponse<TaskAssignment>>('/tasks', data)
    return res.data.data
  },

  getAll: async (params?: Record<string, string>) => {
    console.log('TaskApi.getAll - Calling with params:', params)
    const res = await http.get<ApiResponse<TaskAssignment[]>>('/tasks', { params })
    console.log('TaskApi.getAll - Response:', res)
    console.log('TaskApi.getAll - Response data:', res.data)
    console.log('TaskApi.getAll - Response data.data:', res.data?.data)
    console.log('TaskApi.getAll - Response data.meta:', res.data?.meta)
    return res.data
  },

  getMyTasks: async (params?: Record<string, string>) => {
    const res = await http.get<ApiResponse<TaskAssignment[]>>('/tasks/my-tasks', { params })
    return res.data
  },

  getById: async (id: string) => {
    const res = await http.get<ApiResponse<TaskAssignment>>(`/tasks/${id}`)
    return res.data.data
  },

  updateProgress: async (id: string, data: { status?: TaskStatus; progressNotes?: string }) => {
    const res = await http.patch<ApiResponse<TaskAssignment>>(`/tasks/${id}/progress`, data)
    return res.data.data
  },

  getTaskHistory: async (id: string) => {
    const res = await http.get<ApiResponse<TaskProgressHistory[]>>(`/tasks/${id}/history`)
    return res.data.data
  },

  updateStatus: async (id: string, status: TaskStatus) => {
    const res = await http.patch<ApiResponse<TaskAssignment>>(`/tasks/${id}/status`, { status })
    return res.data.data
  },

  getTracking: async () => {
    const res = await http.get<ApiResponse<TaskTrackingData>>('/tasks/tracking')
    return res.data.data
  },

  getStaffMembers: async () => {
    const res = await http.get<ApiResponse<Array<{ id: string; name: string; email: string }>>>('/tasks/staff')
    return res.data.data
  },

  delete: async (id: string) => {
    const res = await http.delete<ApiResponse<null>>(`/tasks/${id}`)
    return res.data
  },
}

// Google Calendar API
export type CalendarEvent = {
  id: string
  title: string
  start: string | Date
  end: string | Date
  type: 'TOUR' | 'CUSTOM'
  organizer?: string
  venue?: string
  description?: string
  googleSynced: boolean
}

export const googleCalendarApi = {
  getStatus: async (): Promise<{ connected: boolean }> => {
    const res = await http.get<ApiResponse<{ connected: boolean }>>('/google/status')
    return res.data.data
  },

  getEvents: async (): Promise<CalendarEvent[]> => {
    const res = await http.get<ApiResponse<CalendarEvent[]>>('/google/events')
    return res.data.data
  },

  disconnect: async () => {
    const res = await http.delete<ApiResponse<null>>('/google/disconnect')
    return res.data
  },

  syncAll: async (): Promise<{ synced: number; total: number }> => {
    const res = await http.post<ApiResponse<{ synced: number; total: number }>>('/google/sync')
    return res.data.data
  },

  addCustomEvent: async (data: { title: string; startDateTime: string; description?: string }) => {
    const res = await http.post<ApiResponse<CalendarEvent>>('/google/events', data)
    return res.data.data
  },

  deleteCustomEvent: async (id: string) => {
    const res = await http.delete<ApiResponse<null>>(`/google/events/${id}`)
    return res.data
  },
}

// Legacy API export for backward compatibility
export const api = {
  signup: async (data: SignupRequest) => authApi.register(data),
  login: async (data: LoginRequest) => authApi.login(data),
}
