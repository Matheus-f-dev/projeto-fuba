import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth'
import { getDoc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore'
import { firebaseConfig, useEmulators } from '@/firebase/app'
import { COL, colRef, docRef, reviveDates } from '@/firebase/collections'
import type { ActiveStatus, AppUser, Organization, UserRole } from '@/types/domain'
import { DomainError, requireAdmin, stamp, type SessionContext } from './context'
import { listen } from './subscribe'

export interface NewUserInput {
  name: string
  email: string
  phone: string
  role: UserRole
  password: string
}

export const usersService = {
  async getProfile(uid: string): Promise<AppUser | null> {
    const snap = await getDoc(docRef(COL.users, uid))
    return snap.exists() ? reviveDates<AppUser>({ id: snap.id, ...snap.data() }) : null
  },

  subscribeProfile(uid: string, onData: (user: AppUser | null) => void, onError: (e: Error) => void) {
    return onSnapshot(
      docRef(COL.users, uid),
      (snap) => onData(snap.exists() ? reviveDates<AppUser>({ id: snap.id, ...snap.data() }) : null),
      onError,
    )
  },

  subscribeOrganization(organizationId: string, onData: (org: Organization | null) => void, onError: (e: Error) => void) {
    return onSnapshot(
      docRef(COL.organizations, organizationId),
      (snap) =>
        onData(snap.exists() ? reviveDates<Organization>({ id: snap.id, ...snap.data({ serverTimestamps: 'estimate' }) }) : null),
      onError,
    )
  },

  subscribeOrgUsers(organizationId: string, onData: (items: AppUser[]) => void, onError: (e: Error) => void) {
    return listen<AppUser>(query(colRef(COL.users), where('organizationId', '==', organizationId)), onData, onError)
  },

  /**
   * Cria o acesso de um novo usuário sem derrubar a sessão do administrador:
   * a conta é criada numa instância secundária do Firebase Auth.
   */
  async create(ctx: SessionContext, input: NewUserInput) {
    requireAdmin(ctx)
    const name = input.name.trim()
    const email = input.email.trim().toLowerCase()
    if (name.length < 3) throw new DomainError('Informe o nome completo.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DomainError('E-mail inválido.')
    if (input.password.length < 8) throw new DomainError('A senha inicial precisa ter pelo menos 8 caracteres.')

    const secondary = initializeApp(firebaseConfig, `user-creation-${Date.now()}`)
    const secondaryAuth = getAuth(secondary)
    if (useEmulators) connectAuthEmulator(secondaryAuth, 'http://127.0.0.1:9099', { disableWarnings: true })
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, input.password)
      await setDoc(docRef(COL.users, cred.user.uid), {
        organizationId: ctx.organizationId,
        name,
        email,
        phone: input.phone.replace(/\D/g, ''),
        role: input.role,
        status: 'ACTIVE',
        createdAt: stamp(),
        updatedAt: stamp(),
      })
      await signOut(secondaryAuth)
      return cred.user.uid
    } finally {
      await deleteApp(secondary)
    }
  },

  async update(ctx: SessionContext, uid: string, patch: { role?: UserRole; status?: ActiveStatus; name?: string; phone?: string }) {
    requireAdmin(ctx)
    if (uid === ctx.actor.uid && (patch.role && patch.role !== 'ADMIN' || patch.status === 'INACTIVE'))
      throw new DomainError('Você não pode remover o seu próprio acesso de administrador.')
    await updateDoc(docRef(COL.users, uid), { ...patch, updatedAt: stamp() })
  },

  /** O próprio usuário altera nome e telefone (papel e organização só pelo administrador). */
  async updateOwnProfile(ctx: SessionContext, patch: { name: string; phone: string }) {
    if (patch.name.trim().length < 3) throw new DomainError('Informe o nome completo.')
    await updateDoc(docRef(COL.users, ctx.actor.uid), {
      name: patch.name.trim(),
      phone: patch.phone.replace(/\D/g, ''),
      updatedAt: stamp(),
    })
  },

  async updateOrganization(ctx: SessionContext, patch: { name: string; document: string }) {
    requireAdmin(ctx)
    if (patch.name.trim().length < 2) throw new DomainError('Informe o nome da organização.')
    await updateDoc(docRef(COL.organizations, ctx.organizationId), {
      name: patch.name.trim(),
      document: patch.document.replace(/\D/g, ''),
      updatedAt: stamp(),
    })
  },
}
