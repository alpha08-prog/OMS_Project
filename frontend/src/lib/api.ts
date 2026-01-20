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
  status: GrievanceStatus
  isVerified: boolean
  createdAt: string
  createdBy: { id: string; name: string; email: string }
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
export type TrainRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type TrainRequest = {
  id: string
  passengerName: string
  pnrNumber: string
  trainName?: string
  trainNumber?: string
  journeyClass: string
  dateOfJourney: string
  fromStation: string
  toStation: string
  route?: string
  referencedBy?: string
  status: TrainRequestStatus
  createdAt: string
  createdBy: { id: string; name: string; email: string }
  approvedBy?: { id: string; name: string; email: string }
}

export type CreateTrainRequestRequest = {
  passengerName: string
  pnrNumber: string
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
  dateTime: string  // Backend field name
  eventDate?: string  // Alias for compatibility
  venue: string
  venueLink?: string
  description?: string
  referencedBy?: string
  decision: TourProgramDecision
  decisionNote?: string
  createdAt: string
  createdBy: { id: string; name: string; email: string }
}

export type CreateTourProgramRequest = {
  eventName: string
  organizer: string
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
  details: Record<string, any>
}

export type HistoryStats = {
  grievances: { resolved: number; rejected: number; total: number }
  trainRequests: { approved: number; rejected: number; total: number }
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

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

export const http = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

// Add auth token to requests
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
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
      const msg = (resp.data as any)?.message || 'Request failed'
      const err: any = new Error(msg)
      err.status = resp.status
      if (resp.data && typeof resp.data === 'object') Object.assign(err, resp.data)
      
      // Handle 401 - redirect to login
      if (resp.status === 401) {
        localStorage.removeItem('auth_token')
        sessionStorage.removeItem('auth_session')
        // Optionally redirect to login
        // window.location.href = '/auth/login'
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
  
  delete: async (id: string) => {
    const res = await http.delete<ApiResponse<null>>(`/train-requests/${id}`)
    return res.data
  },
  
  getPendingQueue: async (params?: Record<string, string>) => {
    const res = await http.get<ApiResponse<TrainRequest[]>>('/train-requests/queue/pending', { params })
    return res.data
  },
  
  checkPNR: async (pnr: string) => {
    const res = await http.get<ApiResponse<any>>(`/train-requests/pnr/${pnr}`)
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
    const res = await http.get<ApiResponse<any>>('/stats/monetization')
    return res.data.data
  },
  
  getRecentActivity: async () => {
    const res = await http.get<ApiResponse<any>>('/stats/recent-activity')
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
  downloadTrainEQLetter: (id: string) => {
    const token = localStorage.getItem('auth_token')
    const url = `${API_BASE_URL}/pdf/train-eq/${id}?token=${token}`
    window.open(url, '_blank')
  },
  
  // Preview Train EQ Letter (HTML)
  previewTrainEQLetter: async (id: string) => {
    const res = await http.get(`/pdf/train-eq/${id}/preview`, { responseType: 'text' })
    return res.data
  },
  
  // Download Grievance Letter PDF (opens in new tab)
  downloadGrievanceLetter: (id: string) => {
    const token = localStorage.getItem('auth_token')
    const url = `${API_BASE_URL}/pdf/grievance/${id}?token=${token}`
    window.open(url, '_blank')
  },
  
  // Preview Grievance Letter (HTML)
  previewGrievanceLetter: async (id: string) => {
    const res = await http.get(`/pdf/grievance/${id}/preview`, { responseType: 'text' })
    return res.data
  },
  
  // Download Tour Program PDF (opens in new tab)
  downloadTourProgram: (startDate?: string, endDate?: string) => {
    const token = localStorage.getItem('auth_token')
    let url = `${API_BASE_URL}/pdf/tour-program?token=${token}`
    if (startDate) url += `&startDate=${startDate}`
    if (endDate) url += `&endDate=${endDate}`
    window.open(url, '_blank')
  },
  
  // Generic PDF download helper (uses axios with blob)
  downloadPDF: async (endpoint: string, filename: string) => {
    try {
      const res = await http.get(endpoint, { responseType: 'blob' })
      const blob = new Blob([res.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('PDF download error:', error)
      throw error
    }
  },
}

// Legacy API export for backward compatibility
export const api = {
  signup: async (data: SignupRequest) => authApi.register(data),
  login: async (data: LoginRequest) => authApi.login(data),
}
