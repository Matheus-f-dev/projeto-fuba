import { addDoc, query, updateDoc, where } from 'firebase/firestore'
import { COL, colRef, docRef } from '@/firebase/collections'
import type { ActiveStatus, Driver } from '@/types/domain'
import { DomainError, requireStaff, stamp, type SessionContext } from './context'
import { listen } from './subscribe'

export interface DriverInput {
  name: string
  phone: string
  document: string
  license: string
  licenseCategory: string
}

export function validateDriverInput(input: DriverInput): Record<string, string> {
  const errors: Record<string, string> = {}
  if (input.name.trim().length < 3) errors.name = 'Informe o nome completo.'
  const phone = input.phone.replace(/\D/g, '')
  if (phone.length < 10 || phone.length > 11) errors.phone = 'Telefone com DDD, 10 ou 11 dígitos.'
  if (input.document && input.document.replace(/\D/g, '').length !== 11) errors.document = 'CPF com 11 dígitos.'
  if (input.license && !/^\d{9,11}$/.test(input.license.replace(/\D/g, '')))
    errors.license = 'Número da CNH com 9 a 11 dígitos.'
  return errors
}

function clean(input: DriverInput) {
  const first = Object.values(validateDriverInput(input))[0]
  if (first) throw new DomainError(first)
  return {
    name: input.name.trim(),
    phone: input.phone.replace(/\D/g, ''),
    document: input.document.replace(/\D/g, ''),
    license: input.license.replace(/\D/g, ''),
    licenseCategory: input.licenseCategory.trim().toUpperCase(),
  }
}

export const driversService = {
  subscribe(organizationId: string, onData: (items: Driver[]) => void, onError: (e: Error) => void) {
    return listen<Driver>(query(colRef(COL.drivers), where('organizationId', '==', organizationId)), onData, onError)
  },

  async create(ctx: SessionContext, input: DriverInput) {
    requireStaff(ctx)
    const ref = await addDoc(colRef(COL.drivers), {
      ...clean(input),
      organizationId: ctx.organizationId,
      userId: null,
      status: 'ACTIVE',
      createdAt: stamp(),
      updatedAt: stamp(),
    })
    return ref.id
  },

  async update(ctx: SessionContext, id: string, input: DriverInput) {
    requireStaff(ctx)
    await updateDoc(docRef(COL.drivers, id), { ...clean(input), updatedAt: stamp() })
  },

  async setStatus(ctx: SessionContext, id: string, status: ActiveStatus) {
    requireStaff(ctx)
    await updateDoc(docRef(COL.drivers, id), { status, updatedAt: stamp() })
  },
}
