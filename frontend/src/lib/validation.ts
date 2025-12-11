export function validateFullName(v: string) {
  if (!v || v.trim().length < 2) return 'Full name must be at least 2 characters.'
}
export function validateEmail(v: string) {
  if (!v) return 'Email is required.'
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  if (!ok) return 'Enter a valid email.'
}
export function validatePhone(v: string) {
  if (!v) return 'Mobile number is required.'
  const ok = /^\d{10}$/.test(v)
  if (!ok) return 'Enter a 10 digit mobile number.'
}
export function validatePassword(v: string) {
  if (!v) return 'Password is required.'
  const ok = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(v)
  if (!ok) return 'Min 8 chars with upper, lower, number, and special character.'
}
export function matchPasswords(a: string, b: string) {
  if (a !== b) return 'Passwords do not match.'
}
export function validateIdentifier(v: string) {
  if (!v) return 'Email or mobile is required.'
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  const isPhone = /^\d{10}$/.test(v)
  if (!isEmail && !isPhone) return 'Enter a valid email or 10 digit mobile.'
}
