import axios, { type AxiosError, type AxiosResponse } from 'axios'

// ===========================================
// Types
// ===========================================

export type UserRole = 'STAFF' | 'ADMIN' | 'SUPER_ADMIN'

export type PasswordPolicy = {
  used: number
  allowed: number
  windowMonth: string  // "YYYY-MM"
  resetsAt: string     // ISO timestamp for first day of next month, UTC
}

export type User = {
  id: string
  name: string
  email: string
  phone?: string
  role: UserRole
  // Present on /auth/me and /auth/password responses; absent elsewhere.
  passwordPolicy?: PasswordPolicy
}

// Auth Types
export type SignupRequest = { name: string; email: string; phone?: string; password: string }
export type SignupResponse = { user: User; token: string }

export type LoginRequest = { identifier: string; password: string }
export type LoginResponse = { user: User; token: string }

// Grievance Types
export type GrievanceType = 'WATER' | 'ROAD' | 'POLICE' | 'HEALTH' | 'TRANSFER' | 'FINANCIAL_AID' | 'ELECTRICITY' | 'EDUCATION' | 'HOUSING' | 'TEMPLE_VISIT' | 'OTHER'
export type GrievanceStatus = 'OPEN' | 'IN_PROGRESS' | 'VERIFIED' | 'RESOLVED' | 'REJECTED'
export type ActionRequired = 'GENERATE_LETTER' | 'CALL_OFFICIAL' | 'FORWARD_TO_DEPT' | 'SCHEDULE_MEETING' | 'NO_ACTION'
export type GrievancePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type GrievanceSource = 'PUBLIC' | 'OFFICE'
export type TempleServiceCode =
  | 'SPECIAL_DARSHAN'
  | 'DARSHAN'
  | 'SPARSH_DARSHAN'
  | 'MANGALARATI'
  | 'BHASMARATI'
  | 'POOJA'
  | 'ACCOMMODATION'

export type GrievanceTimelineEvent = {
  at: string | null
  by: string | null
  byId: string | null
  type: 'CREATED' | 'EDITED' | 'REMARK'
  note: string
  status: string | null
}

export type GrievanceTimeline = {
  referenceNo: string
  status: string | null
  timeline: GrievanceTimelineEvent[]
}

export type Grievance = {
  id: string
  // Human-friendly unique reference (e.g. "GRV-37719000000076188").
  referenceNo?: string
  petitionerName: string
  mobileNumber: string
  constituency: string
  wardVillage?: string
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
  resolvedAt?: string | null
  createdBy: { id: string; name: string; email: string }
  createdById?: string
  verifiedBy?: { id: string; name: string; email: string }
  priority?: GrievancePriority
  source?: GrievanceSource
  // Temple-visit specific. Present only when grievanceType === 'TEMPLE_VISIT'.
  templeKey?: string | null
  // Newline-separated address block for off-registry ("Other") temples.
  templeRecipient?: string | null
  memberCount?: number | null
  originDistrict?: string | null
  originState?: string | null
  visitDateFrom?: string | null
  visitDateTo?: string | null
  servicesRequested?: Array<TempleServiceCode | `OTHER:${string}`>
  showMobileOnLetter?: boolean
  // Edit audit — who last edited this grievance and when.
  lastEditedById?: string | null
  lastEditedAt?: string | null
  lastEditedBy?: { id: string; name: string; email: string } | null
}

export type CreateGrievanceRequest = {
  petitionerName: string
  mobileNumber: string
  constituency: string
  wardVillage?: string
  grievanceType: GrievanceType
  description: string
  monetaryValue?: number
  actionRequired?: ActionRequired
  letterTemplate?: string
  referencedBy?: string
  priority?: GrievancePriority
  source?: GrievanceSource
  // Temple-visit fields — all optional; ignored when grievanceType !== TEMPLE_VISIT
  templeKey?: string
  // Newline-separated recipient/address lines for off-registry ("Other") temples.
  templeRecipient?: string
  memberCount?: number
  originDistrict?: string
  originState?: string
  visitDateFrom?: string
  visitDateTo?: string
  // Each entry is either a TempleServiceCode (predefined) or a freeform
  // "OTHER:<text>" string that staff entered via the "Other" option.
  servicesRequested?: Array<TempleServiceCode | `OTHER:${string}`>
  showMobileOnLetter?: boolean
}

export type TempleRegistryEntry = {
  key: string
  deity: string
  recipient: string[]
  defaultServices: TempleServiceCode[]
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
  constituency?: string
  wardVillage?: string
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
  constituency?: string
  wardVillage?: string
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

export type TrainPassengerInput = {
  name: string
  gender?: 'MALE' | 'FEMALE' | 'OTHER'
  age?: number
  /** Date of birth (YYYY-MM-DD). Captured for the primary passenger and fed
   *  into the shared birthday module. */
  dob?: string
  /**
   * Current waitlist / booking status string (e.g. "WL/12", "RAC/3", "CNF").
   * Stored on TrainPassenger.currentStatus and rendered in the letter's W/L column.
   */
  currentStatus?: string
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
  /** Structured passenger rows. Backend writes these to TrainPassenger. */
  passengers?: TrainPassengerInput[]
  /** Total people on this PNR (primary + additional). Drives the "+ N others"
   *  rendering on the EQ letter. */
  numberOfPassengers?: number
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
  // Edit audit — who last edited this tour and when.
  lastEditedById?: string | null
  lastEditedAt?: string | null
  lastEditedBy?: { id: string; name: string; email: string } | null
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
  designation?: string
  constituency?: string
  wardVillage?: string
  createdAt: string
  createdBy?: { id: string; name: string; email: string }
  // Where this DOB came from (BIRTHDAY entry, VISITOR log, or TRAIN passenger)
  // and whether it can be edited/deleted from the Birthdays page.
  source?: 'BIRTHDAY' | 'VISITOR' | 'TRAIN'
  canDelete?: boolean
}

export type CreateBirthdayRequest = {
  name: string
  phone?: string
  dob: string
  relation: string
  notes?: string
  constituency?: string
  wardVillage?: string
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
    /** Cursor-based pagination (keyset). null on the last page. */
    nextCursor?: string | null
  }
}

// ===========================================
// API Configuration
// ===========================================

function normalizeApiUrl(rawUrl: string): string {
  const trimmedUrl = rawUrl.trim().replace(/\/+$/, '')
  return trimmedUrl.endsWith('/api') ? trimmedUrl : `${trimmedUrl}/api`
}

export const API_URL = normalizeApiUrl(
  import.meta.env.VITE_API_URL ||
  'https://omsvackend-50040756292.development.catalystappsail.in'
)

export const http = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  // Fail a stalled request after 30s instead of leaving the spinner up forever.
  timeout: 30000,
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
    const res = await http.put<ApiResponse<{ passwordPolicy: PasswordPolicy } | null>>(
      '/auth/password',
      { currentPassword, newPassword }
    )
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

  // Admin-only: create a new user account with a chosen role and password.
  // Admin shares the password with the new user via a secure channel; the
  // user can rotate it from /profile after first login.
  createUser: async (data: { name: string; email: string; phone?: string; password: string; role: UserRole }) => {
    const res = await http.post<ApiResponse<User>>('/auth/users', data)
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

  // PUT /:id is open to any authenticated user and accepts status too, so the
  // shared "anyone can edit" flow can change status without the admin-only
  // /status endpoint.
  update: async (id: string, data: Partial<CreateGrievanceRequest> & { status?: GrievanceStatus }) => {
    const res = await http.put<ApiResponse<Grievance>>(`/grievances/${id}`, data)
    return res.data.data
  },

  getTimeline: async (id: string): Promise<GrievanceTimeline> => {
    const res = await http.get<ApiResponse<GrievanceTimeline>>(`/grievances/${id}/timeline`)
    return res.data.data ?? { referenceNo: '', status: null, timeline: [] }
  },

  verify: async (id: string) => {
    const res = await http.patch<ApiResponse<Grievance>>(`/grievances/${id}/verify`)
    return res.data.data
  },

  updateStatus: async (id: string, status: GrievanceStatus, reason?: string) => {
    const res = await http.patch<ApiResponse<Grievance>>(`/grievances/${id}/status`, { status, reason })
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
    search?: string
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
      const res = await http.get(`/pdf/train-eq/${id}`, {
        responseType: 'blob',
        validateStatus: (status) => status < 500,
      })

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
      try {
        document.body.appendChild(link)
        link.click()
      } finally {
        link.remove()
        window.URL.revokeObjectURL(url)
      }
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
      const res = await http.get(`/pdf/grievance/${id}`, {
        responseType: 'blob',
        validateStatus: (status) => status < 500,
      })

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
      try {
        document.body.appendChild(link)
        link.click()
      } finally {
        link.remove()
        window.URL.revokeObjectURL(url)
      }
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

  // Fetch the static temple registry (deity / recipient / default services).
  // Used by the GrievanceCreate UI to populate the temple dropdown.
  getTempleRegistry: async () => {
    const res = await http.get<ApiResponse<{
      temples: TempleRegistryEntry[]
      services: Record<TempleServiceCode, string>
    }>>('/pdf/temple-registry')
    return res.data.data
  },

  // Download Temple-Visit letter — backend also auto-closes the grievance
  // (status -> RESOLVED, currentStage -> LETTER_GENERATED) after a successful
  // download, unless it was already RESOLVED.
  downloadTempleVisitLetter: async (id: string) => {
    await pdfApi.downloadPDF(`/pdf/grievance/${id}/temple-visit`, `TempleVisit_Letter_${id}.pdf`)
  },

  previewTempleVisit: async (id: string) => {
    const res = await http.get(`/pdf/grievance/${id}/temple-visit/preview`, { responseType: 'text' })
    return res.data as string
  },

  // Preview Train EQ Letter (HTML). Backend route is staffOnly, so we
  // can't `window.open(...)` the URL directly — that fires off a no-auth
  // GET. Fetch via the authed axios client, then materialise an HTML blob
  // and open the blob URL in a new tab.
  previewTrainEQ: async (id: string) => {
    const res = await http.get(`/pdf/train-eq/${id}/preview`, { responseType: 'text' })
    return res.data as string
  },

  // Preview Tour Program (HTML) for a single tour
  previewTourProgram: async (id: string) => {
    const res = await http.get(`/pdf/tour-program/${id}/preview`, { responseType: 'text' })
    return res.data as string
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
      try {
        document.body.appendChild(link)
        link.click()
      } finally {
        link.remove()
        window.URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('PDF download error:', error)
      throw error
    }
  },

  // Generic PDF download helper (uses axios with blob).
  // `size` is forwarded as a query param when provided — Train EQ ignores it
  // server-side (always A5); grievance/temple/tour respect it (A4 default, A5
  // when explicitly requested).
  downloadPDF: async (endpoint: string, filename: string, size?: 'A4' | 'A5') => {
    try {
      const res = await http.get(endpoint, {
        responseType: 'blob',
        params: size ? { size } : undefined,
        validateStatus: (status) => status < 500, // Don't throw on 4xx errors, we'll handle them
      })

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

      if (blob.size === 0) {
        throw new Error('PDF file is empty')
      }

      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      try {
        document.body.appendChild(link)
        link.click()
      } finally {
        link.remove()
        window.URL.revokeObjectURL(url)
      }
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
export type TaskStatus = 'UNASSIGNED' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD'
export type TaskType = 'GRIEVANCE' | 'TRAIN_REQUEST' | 'TOUR_PROGRAM' | 'GENERAL'

// Other staff working on the same multi-assigned task. Empty array for
// solo assignments. Surfaced in /my-tasks so the staff dashboard can
// render a "+N others assigned" badge without leaking emails.
export type CoAssignee = {
  id: string
  name: string
  status: TaskStatus
}

export type TaskAssignment = {
  id: string
  title: string
  description?: string
  taskType: TaskType
  // PUBLIC = shared board; OFFICE = admin-assignment flow, hidden from staff board.
  source?: 'PUBLIC' | 'OFFICE'
  status: TaskStatus
  priority: string
  referenceId?: string
  referenceType?: string
  // Linked record's reference number (e.g. a grievance's GRV-YYYY-NNNN).
  referenceNo?: string | null
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
  groupId?: string | null
  coAssignees?: CoAssignee[]
}

// Admin-side consolidated card shape: one entry per (multi-assigned) task,
// even though the backend stores N rows in the Task table.
export type TaskGroup = {
  groupId: string         // real groupId, or "solo:<rowid>" for legacy tasks
  isMultiAssign: boolean
  title: string
  description: string | null
  taskType: TaskType
  priority: string
  referenceId: string | null
  referenceType: string | null
  dueDate: string | null
  assignedById: string
  assignedBy: { id: string; name: string; email: string } | null
  createdAt: string
  assignees: Array<{
    taskId: string
    user: { id: string; name: string; email: string } | null
    status: TaskStatus
    priority: string
    progressPercent: number
    progressNotes: string | null
    startedAt: string | null
    completedAt: string | null
    updatedAt: string
  }>
  totalAssignees: number
  completedCount: number
  inProgressCount: number
  onHoldCount: number
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
  // One of these is required. Prefer assignedToIds for new code; assignedToId
  // is kept for back-compat with legacy single-assign call sites.
  assignedToId?: string
  assignedToIds?: string[]
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
  // Returns a single TaskAssignment for back-compat single-assign calls,
  // or a TaskAssignment[] when multi-assign was used. Callers can normalise
  // via Array.isArray().
  create: async (data: CreateTaskRequest) => {
    const res = await http.post<ApiResponse<TaskAssignment | TaskAssignment[]>>('/tasks', data)
    return res.data.data
  },

  // Admin assigns an EXISTING (unassigned) task to a staff member — the office
  // flow. The task then appears in that staff member's My Tasks.
  assign: async (id: string, assignedToId: string) => {
    const res = await http.patch<ApiResponse<TaskAssignment>>(`/tasks/${id}/assign`, { assignedToId })
    return res.data.data
  },

  // Active staff members, for the assignment dropdown.
  getStaff: async (): Promise<{ id: string; name: string; email: string }[]> => {
    const res = await http.get<ApiResponse<{ id: string; name: string; email: string }[]>>('/tasks/staff')
    return res.data.data ?? []
  },

  // Admin-only consolidated view: tasks with the same groupId collapse into
  // one TaskGroup with an assignees[] list (so 1 task assigned to 5 staff
  // shows as 1 card, not 5 rows).
  getGroups: async (params?: Record<string, string>) => {
    const res = await http.get<ApiResponse<TaskGroup[]>>('/tasks/groups', { params })
    return res.data
  },

  getAll: async (params?: Record<string, string>) => {
    const res = await http.get<ApiResponse<TaskAssignment[]>>('/tasks', { params })
    return res.data
  },

  // Shared "All Tasks" board — every task, visible to any authenticated user.
  getAllShared: async (params?: Record<string, string>) => {
    const res = await http.get<ApiResponse<TaskAssignment[]>>('/tasks/all', { params })
    return res.data
  },

  // Shared edit — any authenticated user may change status / add a remark.
  // Each change is recorded in the audit timeline with editor + timestamp.
  editShared: async (id: string, data: { status?: TaskStatus; progressNotes?: string }) => {
    const res = await http.patch<ApiResponse<TaskAssignment>>(`/tasks/${id}/edit`, data)
    return res.data.data
  },

  // Full audit timeline for any task (read-only, visible to everyone).
  getAudit: async (id: string) => {
    const res = await http.get<ApiResponse<TaskProgressHistory[]>>(`/tasks/${id}/audit`)
    return res.data.data
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
  type: 'TOUR' | 'CUSTOM' | 'MEETING'
  organizer?: string
  venue?: string
  location?: string
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

// Attachments / file uploads (Stratus-backed)
export type AttachmentContextType = 'GRIEVANCE' | 'TOUR' | 'NEWS' | 'PHOTO_BOOTH'

export type Attachment = {
  id: string
  contextType: string
  contextId: string | null
  filename: string
  mimeType: string
  size: number
  uploaderId: string | null
  createdAt: string | null
  url: string  // backend route — calling it 302-redirects to a fresh signed Stratus URL
}

export const uploadsApi = {
  /**
   * Upload a file. Returns the saved Attachment metadata (id + backend URL).
   * Pass `contextId` once the parent entity exists so the upload is linked.
   * Caller is responsible for catching errors (size > 10MB, unsupported MIME).
   */
  upload: async (
    file: File,
    contextType: AttachmentContextType,
    contextId?: string
  ): Promise<Attachment> => {
    const form = new FormData()
    form.append('file', file)
    form.append('contextType', contextType)
    if (contextId) form.append('contextId', contextId)
    const res = await http.post<ApiResponse<Attachment>>('/uploads', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data.data
  },

  /** List attachments for a parent record (e.g. one grievance, one tour). */
  list: async (
    contextType: AttachmentContextType,
    contextId: string
  ): Promise<Attachment[]> => {
    const res = await http.get<ApiResponse<Attachment[]>>('/uploads', {
      params: { contextType, contextId },
    })
    return res.data.data
  },

  /** Returns the full URL to use as a link/img src — hits the auth-gated backend route. */
  getUrl: (id: string) => `${API_URL}/uploads/${id}`,

  delete: async (id: string) => {
    const res = await http.delete<ApiResponse<{ id: string }>>(`/uploads/${id}`)
    return res.data
  },
}

// Notifications (in-app bell)
export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_RESOLVED'
  | 'TOUR_DECIDED'
  | 'NEWS_CRITICAL'
  | 'GRIEVANCE_REJECTED'
  | 'TEMPLE_VISIT_LETTER_GENERATED'

export type Notification = {
  id: string
  recipientId: string | null
  type: NotificationType
  title: string
  body: string
  link: string | null
  referenceId: string | null
  referenceType: string | null
  isRead: boolean
  createdAt: string | null
}

export const notificationsApi = {
  list: async (unreadOnly = false): Promise<Notification[]> => {
    const params = unreadOnly ? { unread: 'true' } : undefined
    const res = await http.get<ApiResponse<Notification[]>>('/notifications', { params })
    return res.data.data
  },
  unreadCount: async (): Promise<number> => {
    const res = await http.get<ApiResponse<{ count: number }>>('/notifications/unread-count')
    return res.data.data?.count ?? 0
  },
  markRead: async (id: string) => {
    const res = await http.patch<ApiResponse<Notification>>(`/notifications/${id}/read`)
    return res.data.data
  },
  markAllRead: async () => {
    const res = await http.post<ApiResponse<{ updated: number }>>('/notifications/read-all')
    return res.data.data
  },
}

// ===========================================
// Attendance API
// ===========================================
export type AttendanceStatus = 'PRESENT' | 'HALF_DAY' | 'LEAVE'
export type AttendanceRow = {
  id: string
  userId: string
  userName: string
  userRole: string
  date: string
  status: AttendanceStatus | 'ABSENT'
  reason: string | null
  markedAt: string | null
  checkOutAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type AttendanceStats = {
  date: string
  totalStaff: number
  present: number
  halfDay: number
  leave: number
  absent: number
}

export type AttendanceAggregateRow = {
  userId: string
  userName: string
  present: number
  halfDay: number
  leave: number
  totalMarked: number
}

export type AttendanceAggregate = {
  startDate: string
  endDate: string
  totalStaff: number
  staff: AttendanceAggregateRow[]
}

export type LeaveRangeResult = {
  startDate: string
  endDate: string
  count: number
  records: AttendanceRow[]
  skipped: { date: string; status: string }[]
}

export const attendanceApi = {
  // `date` (YYYY-MM-DD) is only meaningful for LEAVE — the backend rejects
  // future/past dates for PRESENT / HALF_DAY. Leave undefined to mean today.
  mark: async (status: AttendanceStatus, reason?: string, date?: string) => {
    const res = await http.post<ApiResponse<AttendanceRow>>('/attendance', { status, reason, date })
    return res.data.data
  },

  // Stamp the check-out (leave-for-the-day) time on today's row. Requires the
  // caller to have already marked present/half-day today.
  checkOut: async (): Promise<AttendanceRow> => {
    const res = await http.post<ApiResponse<AttendanceRow>>('/attendance/checkout', {})
    return res.data.data
  },

  // Multi-day leave: one row per day in [startDate, endDate]. Days already
  // marked PRESENT/HALF_DAY are returned in `skipped` rather than overwritten.
  markLeaveRange: async (
    startDate: string,
    endDate: string,
    reason: string
  ): Promise<LeaveRangeResult> => {
    const res = await http.post<ApiResponse<LeaveRangeResult>>(
      '/attendance/leave-range',
      { startDate, endDate, reason }
    )
    return (
      res.data.data ?? {
        startDate,
        endDate,
        count: 0,
        records: [],
        skipped: [],
      }
    )
  },

  getMyToday: async (): Promise<AttendanceRow | null> => {
    const res = await http.get<ApiResponse<AttendanceRow | null>>('/attendance/me/today')
    return res.data.data ?? null
  },

  getMyHistory: async (params?: {
    startDate?: string
    endDate?: string
    limit?: number
    cursor?: string | null
  }): Promise<{ rows: AttendanceRow[]; nextCursor: string | null }> => {
    // Strip nullish cursor — axios serialises `null` as the literal string "null",
    // which the backend would then try to base64-decode.
    const cleaned: Record<string, string | number> = {}
    if (params?.startDate) cleaned.startDate = params.startDate
    if (params?.endDate) cleaned.endDate = params.endDate
    if (params?.limit) cleaned.limit = params.limit
    if (params?.cursor) cleaned.cursor = params.cursor
    const res = await http.get<ApiResponse<AttendanceRow[]>>('/attendance/me', { params: cleaned })
    return {
      rows: res.data.data ?? [],
      nextCursor: (res.data.meta?.nextCursor ?? null) as string | null,
    }
  },

  getAll: async (params?: { date?: string; startDate?: string; endDate?: string }) => {
    const res = await http.get<ApiResponse<AttendanceRow[]>>('/attendance', { params })
    return res.data.data ?? []
  },

  getTodayStats: async (): Promise<AttendanceStats> => {
    const res = await http.get<ApiResponse<AttendanceStats>>('/attendance/stats')
    return res.data.data ?? { date: '', totalStaff: 0, present: 0, halfDay: 0, leave: 0, absent: 0 }
  },

  getAggregate: async (params: { startDate: string; endDate: string }): Promise<AttendanceAggregate> => {
    const res = await http.get<ApiResponse<AttendanceAggregate>>('/attendance/aggregate', { params })
    return res.data.data ?? { startDate: params.startDate, endDate: params.endDate, totalStaff: 0, staff: [] }
  },
}

// ===========================================
// Meetings (admin-only)
// ===========================================

export type MeetingStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'

export interface Meeting {
  id: string
  title: string
  dateTime: string
  location: string | null
  attendees: string | null
  agenda: string | null
  status: MeetingStatus
  summary: string | null
  createdById: string | null
  createdBy: { id: string; name: string; email: string } | null
  createdAt: string
  updatedAt: string
  lastEditedById: string | null
  lastEditedBy: { id: string; name: string; email: string } | null
  lastEditedAt: string | null
  googleSynced: boolean
}

export const meetingApi = {
  create: async (data: {
    title: string
    dateTime: string
    location?: string
    attendees?: string
    agenda?: string
  }): Promise<Meeting> => {
    const res = await http.post<ApiResponse<Meeting>>('/meetings', data)
    return res.data.data
  },

  // Returns all meetings (upcoming + past), newest first. `scope` narrows to
  // one side of "now"; omit it to get the full list and split client-side.
  getAll: async (params?: {
    status?: MeetingStatus
    scope?: 'upcoming' | 'past'
    page?: string
    limit?: string
  }): Promise<Meeting[]> => {
    const res = await http.get<ApiResponse<Meeting[]>>('/meetings', { params })
    return res.data.data ?? []
  },

  getById: async (id: string): Promise<Meeting> => {
    const res = await http.get<ApiResponse<Meeting>>(`/meetings/${id}`)
    return res.data.data
  },

  update: async (
    id: string,
    data: Partial<{
      title: string
      dateTime: string
      location: string | null
      attendees: string | null
      agenda: string | null
      status: MeetingStatus
      summary: string | null
    }>
  ): Promise<Meeting> => {
    const res = await http.patch<ApiResponse<Meeting>>(`/meetings/${id}`, data)
    return res.data.data
  },

  remove: async (id: string): Promise<void> => {
    await http.delete<ApiResponse<null>>(`/meetings/${id}`)
  },
}

// ===========================================
// Activity Log (admin) — global who-did-what-when feed
// ===========================================

export type ActivityAction = 'CREATED' | 'EDITED'

export interface ActivityEvent {
  entity: string
  entityId: string
  label: string
  action: ActivityAction
  at: string | null
  byId: string | null
  by: string | null
}

export const activityApi = {
  getAll: async (params?: {
    entity?: string
    action?: ActivityAction
    search?: string
    page?: string
    limit?: string
  }): Promise<{ rows: ActivityEvent[]; total: number }> => {
    const res = await http.get<ApiResponse<ActivityEvent[]>>('/activity', { params })
    return {
      rows: res.data.data ?? [],
      total: res.data.meta?.total ?? (res.data.data?.length ?? 0),
    }
  },
}

// Legacy API export for backward compatibility
export const api = {
  signup: async (data: SignupRequest) => authApi.register(data),
  login: async (data: LoginRequest) => authApi.login(data),
}
