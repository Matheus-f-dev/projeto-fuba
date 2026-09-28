import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { auth } from '@/firebase/app'
import type { SessionContext } from '@/services/context'
import { usersService } from '@/services/usersService'
import type { AppUser, Organization } from '@/types/domain'

type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'noProfile'; user: User }
  | { status: 'blocked'; user: User; profile: AppUser; reason: 'inactive' | 'driver' }
  | { status: 'ready'; user: User; profile: AppUser; organization: Organization | null; ctx: SessionContext }

interface SessionValue {
  state: SessionState
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [profile, setProfile] = useState<AppUser | null | undefined>(undefined)
  const [organization, setOrganization] = useState<Organization | null>(null)

  useEffect(() => onAuthStateChanged(auth, setUser), [])

  useEffect(() => {
    if (!user) {
      setProfile(user === null ? null : undefined)
      return
    }
    setProfile(undefined)
    return usersService.subscribeProfile(user.uid, setProfile, () => setProfile(null))
  }, [user])

  const orgId = profile?.status === 'ACTIVE' ? profile.organizationId : null
  useEffect(() => {
    if (!orgId) return setOrganization(null)
    return usersService.subscribeOrganization(orgId, setOrganization, () => setOrganization(null))
  }, [orgId])

  const state = useMemo<SessionState>(() => {
    if (user === undefined) return { status: 'loading' }
    if (user === null) return { status: 'signedOut' }
    if (profile === undefined) return { status: 'loading' }
    if (profile === null) return { status: 'noProfile', user }
    if (profile.status !== 'ACTIVE') return { status: 'blocked', user, profile, reason: 'inactive' }
    if (profile.role === 'DRIVER') return { status: 'blocked', user, profile, reason: 'driver' }
    return {
      status: 'ready',
      user,
      profile,
      organization,
      ctx: {
        organizationId: profile.organizationId,
        role: profile.role,
        actor: { uid: user.uid, name: profile.name },
      },
    }
  }, [user, profile, organization])

  const value = useMemo<SessionValue>(
    () => ({
      state,
      signIn: async (email, password) => {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      },
      signOut: () => signOut(auth),
    }),
    [state],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession() {
  const value = useContext(Ctx)
  if (!value) throw new Error('useSession fora do SessionProvider')
  return value
}

/** Para telas dentro da área autenticada: sessão garantidamente pronta. */
export function useReadySession() {
  const { state } = useSession()
  if (state.status !== 'ready') throw new Error('Sessão não está pronta')
  return state
}
