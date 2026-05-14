import type { AuthAdapter, StoredUser } from './adapter'

const LOCAL_USER: StoredUser = {
  uid: 'local',
  email: 'local@self-host',
  displayName: 'Local User',
}

export class NoAuthAdapter implements AuthAdapter {
  async getCurrentUser(): Promise<StoredUser | null> {
    return LOCAL_USER
  }

  async signOut(): Promise<void> {
    // no-op
  }
}
