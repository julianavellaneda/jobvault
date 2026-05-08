import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

let cached: { app: App; auth: Auth; db: Firestore } | null = null

export function getAdmin(): { app: App; auth: Auth; db: Firestore } {
  if (cached) return cached
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) {
    const missing = [
      !projectId && 'FIREBASE_PROJECT_ID',
      !clientEmail && 'FIREBASE_CLIENT_EMAIL',
      !privateKey && 'FIREBASE_PRIVATE_KEY',
    ]
      .filter(Boolean)
      .join(', ')
    throw new Error(`missing_admin_credentials: ${missing}`)
  }
  const app = getApps().length
    ? getApp()
    : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
  cached = { app, auth: getAuth(app), db: getFirestore(app) }
  return cached
}
