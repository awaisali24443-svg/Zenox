export interface LoginForm {
  email: string
  password: string
}
export interface AuthState {
  isLoggedIn: boolean
  userId: string | null
  token: string | null
}
