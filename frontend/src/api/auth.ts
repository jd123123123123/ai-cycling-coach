import { apiClient } from './client'
import type { TokenResponse, User, RegisterRequest } from '../types/auth'

/**
 * Register a new user.
 * POST /auth/register with JSON body { email, password }
 */
export async function register(data: RegisterRequest): Promise<TokenResponse> {
  const response = await apiClient.post<TokenResponse>('/auth/register', data)
  return response.data
}

/**
 * Log in with email and password.
 * POST /auth/login as form data (OAuth2PasswordRequestForm expects username/password fields).
 */
export async function login(email: string, password: string): Promise<TokenResponse> {
  const formData = new URLSearchParams()
  formData.append('username', email) // OAuth2PasswordRequestForm uses "username" field
  formData.append('password', password)

  const response = await apiClient.post<TokenResponse>('/auth/login', formData, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return response.data
}

/**
 * Log out. Server clears the httpOnly refresh token cookie.
 * POST /auth/logout
 */
export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout')
}

/**
 * Refresh the access token using the httpOnly refresh token cookie.
 * POST /auth/refresh — withCredentials is already set on apiClient.
 */
export async function refreshToken(): Promise<TokenResponse> {
  const response = await apiClient.post<TokenResponse>('/auth/refresh')
  return response.data
}

/**
 * Get the currently authenticated user's profile.
 * GET /auth/me
 */
export async function getMe(): Promise<User> {
  const response = await apiClient.get<User>('/auth/me')
  return response.data
}
