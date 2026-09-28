import { getDocs, limit, orderBy, query, runTransaction, Timestamp, where } from 'firebase/firestore'
import { db } from '@/firebase/app'
import { COL, colRef, docRef, newDocRef, reviveDates } from '@/firebase/collections'
import type { LocationPoint } from '@/types/domain'
import { assertSameOrg, DomainError, stamp, type SessionContext } from './context'

/**
 * Localização do motorista. Só é aceita com a rota em andamento (finalidade
 * operacional, LGPD) e respeita um intervalo mínimo entre pontos para não inflar o banco.
 * Retenção prevista: apagar pontos com mais de 30 dias por rotina agendada.
 */
export const MIN_INTERVAL_MS = 15_000
export const TRAIL_LIMIT = 300

export interface LocationInput {
  lat: number
  lng: number
  accuracy: number | null
}

export const locationService = {
  /** Devolve false quando o ponto foi descartado por chegar antes do intervalo mínimo. */
  async record(ctx: SessionContext, routeId: string, point: LocationInput): Promise<boolean> {
    if (Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) throw new DomainError('Coordenadas inválidas.')
    const routeRef = docRef(COL.routes, routeId)
    return runTransaction(db, async (tx) => {
      const route = (await tx.get(routeRef)).data()
      assertSameOrg(ctx, route)
      if (route!.status !== 'IN_PROGRESS' || !route!.driverId)
        throw new DomainError('Localização só é registrada com a rota em andamento.')
      const last = route!.lastLocation?.recordedAt as Timestamp | undefined
      if (last && Date.now() - last.toMillis() < MIN_INTERVAL_MS) return false

      tx.set(newDocRef(COL.locationHistory), {
        organizationId: ctx.organizationId,
        routeId,
        driverId: route!.driverId,
        lat: point.lat,
        lng: point.lng,
        accuracy: point.accuracy,
        recordedAt: stamp(),
      })
      tx.update(routeRef, {
        lastLocation: { lat: point.lat, lng: point.lng, accuracy: point.accuracy, recordedAt: stamp() },
        updatedAt: stamp(),
      })
      return true
    })
  },

  /** Trajeto recente da rota (leitura única, sem listener). */
  async getTrail(organizationId: string, routeId: string): Promise<LocationPoint[]> {
    const snap = await getDocs(
      query(
        colRef(COL.locationHistory),
        where('organizationId', '==', organizationId),
        where('routeId', '==', routeId),
        orderBy('recordedAt', 'desc'),
        limit(TRAIL_LIMIT),
      ),
    )
    return snap.docs.map((d) => reviveDates<LocationPoint>({ id: d.id, ...d.data() })).reverse()
  },
}
