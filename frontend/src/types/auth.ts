export interface User {
  id: number
  email: string
  display_name: string | null
  avatar_url: string | null
  is_active: boolean
  created_at: string
}

export interface UserProfileUpdate {
  display_name?: string | null
  avatar_url?: string | null
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

export interface RegisterRequest {
  email: string
  password: string
  /** The invite that brought this rider, if one did. Sent to the server, which
   *  opens the referral window — the code was previously stashed in
   *  localStorage and never sent anywhere, so no referral was ever recorded. */
  referral_code?: string
}

export interface LoginRequest {
  email: string
  password: string
}
