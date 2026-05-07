import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import type { User } from 'firebase/auth'
import { useAuth } from '@/hooks/useAuth'
import { useApplications } from '@/hooks/useApplications'
import { usePendingUrls } from '@/hooks/usePendingUrls'
import { AuthGate } from '@/components/AuthGate'
import { Nav, type View } from '@/components/Nav'
import { Dashboard } from '@/pages/Dashboard'
import { Applications } from '@/pages/Applications'
import { Kanban } from '@/pages/Kanban'
import { AddLinks } from '@/pages/AddLinks'
import { Pending } from '@/pages/Pending'

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('theme')
    if (stored) return stored === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])
  return [dark, () => setDark(d => !d)] as const
}

const KNOWN_VIEWS: View[] = ['dashboard', 'applications', 'kanban', 'pending', 'add']

function useView() {
  const [view, setView] = useState<View>(() => {
    const hash = window.location.hash.slice(1) as View
    return KNOWN_VIEWS.includes(hash) ? hash : 'dashboard'
  })
  useEffect(() => {
    window.location.hash = view
  }, [view])
  return [view, setView] as const
}

function AppShell({
  user,
  onSignOut,
  dark,
  onToggleDark,
}: {
  user: User
  onSignOut: () => void
  dark: boolean
  onToggleDark: () => void
}) {
  const [view, setView] = useView()
  const { apps, loading } = useApplications()
  const { pending, loading: pendingLoading } = usePendingUrls()
  return (
    <div className="min-h-svh">
      <Nav
        view={view}
        onView={setView}
        user={user}
        onSignOut={onSignOut}
        dark={dark}
        onToggleDark={onToggleDark}
        pendingCount={pending.length}
      />
      {view === 'dashboard' ? (
        <Dashboard apps={apps} />
      ) : view === 'applications' ? (
        <Applications apps={apps} loading={loading} />
      ) : view === 'kanban' ? (
        <Kanban apps={apps} />
      ) : view === 'pending' ? (
        <Pending user={user} pending={pending} loading={pendingLoading} />
      ) : (
        <AddLinks user={user} />
      )}
    </div>
  )
}

export default function App() {
  const auth = useAuth()
  const [dark, toggleDark] = useDarkMode()
  return (
    <>
      <Toaster theme={dark ? 'dark' : 'light'} richColors position="bottom-right" />
      <AuthGate auth={auth}>
        {auth.user ? (
          <AppShell
            user={auth.user}
            onSignOut={auth.signOut}
            dark={dark}
            onToggleDark={toggleDark}
          />
        ) : null}
      </AuthGate>
    </>
  )
}
