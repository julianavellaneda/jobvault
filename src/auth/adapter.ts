export interface StoredUser {
  uid: string
  email: string
  displayName: string
}

export interface AuthAdapter {
  getCurrentUser(): Promise<StoredUser | null>
  signOut(): Promise<void>
}
