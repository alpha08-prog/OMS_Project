import axios, { type AxiosError, type AxiosResponse } from 'axios'

export type User = { id: string; name: string; email: string; role?: 'Public'|'Staff'|'Admin'|'SuperAdmin' }

export type SignupRequest = { name: string; email: string; phone: string; password: string }
export type SignupResponse = { user: User; token?: string }

export type LoginRequest = { identifier: string; password: string }
export type LoginResponse = { user: User; token?: string }

export const http = axios.create({
  baseURL: '/',
  withCredentials: true, // prefer httpOnly cookie session on server
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.response.use(
  (res: AxiosResponse) => res,
  (error: AxiosError) => {
    const resp = error?.response
    if (resp) {
      const msg = (resp.data as any)?.message || 'Request failed'
      const err: any = new Error(msg)
      err.status = resp.status
      if (resp.data && typeof resp.data === 'object') Object.assign(err, resp.data)
      return Promise.reject(err)
    }
    return Promise.reject(error)
  }
)

export const api = {
  signup: async (data: SignupRequest) => (await http.post<SignupResponse>('/api/auth/signup', data)).data,
  login: async (data: LoginRequest) => (await http.post<LoginResponse>('/api/auth/login', data)).data,
}
