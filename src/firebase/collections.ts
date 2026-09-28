import { collection, doc, Timestamp } from 'firebase/firestore'
import { db } from './app'

/** Nomes das coleções. Mantidos em um só lugar (espelhados em firestore.rules). */
export const COL = {
  organizations: 'organizations',
  users: 'users',
  orders: 'orders',
  routes: 'routes',
  routeStops: 'routeStops',
  drivers: 'drivers',
  vehicles: 'vehicles',
  deliveryProofs: 'deliveryProofs',
  occurrences: 'occurrences',
  locationHistory: 'locationHistory',
  statusHistory: 'statusHistory',
} as const

export type CollectionName = (typeof COL)[keyof typeof COL]

export const colRef = (name: CollectionName) => collection(db, name)
export const docRef = (name: CollectionName, id: string) => doc(db, name, id)
export const newDocRef = (name: CollectionName) => doc(collection(db, name))

/** Converte Timestamp → Date (null-safe). */
export function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  return null
}

/** Converte recursivamente todos os Timestamps de um documento em Date. */
export function reviveDates<T>(data: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Timestamp) out[key] = value.toDate()
    else if (value && typeof value === 'object' && !Array.isArray(value))
      out[key] = reviveDates(value as Record<string, unknown>)
    else out[key] = value
  }
  return out as T
}
