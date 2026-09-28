import { query, runTransaction, where } from 'firebase/firestore'
import { OCCURRENCE_TYPE_LABEL } from '@/domain/status'
import { db } from '@/firebase/app'
import { COL, colRef, docRef, newDocRef } from '@/firebase/collections'
import type { Occurrence, OccurrenceType } from '@/types/domain'
import { daysAgo } from '@/utils/dates'
import { assertSameOrg, DomainError, requireStaff, stamp, writeHistory, type SessionContext } from './context'
import { listenMerged } from './subscribe'

export interface OccurrenceInput {
  type: OccurrenceType
  description: string
  orderId: string | null
  routeId: string | null
  driverId: string | null
}

export const occurrencesService = {
  /** Em aberto (qualquer data) + abertas nos últimos 30 dias. */
  subscribe(organizationId: string, onData: (items: Occurrence[]) => void, onError: (e: Error) => void) {
    const base = colRef(COL.occurrences)
    return listenMerged<Occurrence>(
      [
        query(base, where('organizationId', '==', organizationId), where('status', '==', 'OPEN')),
        query(base, where('organizationId', '==', organizationId), where('createdAt', '>=', daysAgo(30))),
      ],
      onData,
      onError,
    )
  },

  /** Ocorrência avulsa (ex.: problema no veículo). Não altera o status da entrega. */
  async create(ctx: SessionContext, input: OccurrenceInput) {
    requireStaff(ctx)
    if (!input.description.trim()) throw new DomainError('Descreva a ocorrência.')
    if (!input.orderId && !input.routeId) throw new DomainError('Vincule a ocorrência a um pedido ou rota.')
    const ref = newDocRef(COL.occurrences)
    await runTransaction(db, async (tx) => {
      tx.set(ref, {
        organizationId: ctx.organizationId,
        type: input.type,
        description: input.description.trim(),
        status: 'OPEN',
        orderId: input.orderId,
        routeId: input.routeId,
        stopId: null,
        driverId: input.driverId,
        createdBy: ctx.actor,
        createdAt: stamp(),
        resolvedAt: null,
        resolvedBy: null,
        resolution: '',
      })
      writeHistory(tx, ctx, {
        event: 'OCCURRENCE_OPENED',
        orderId: input.orderId,
        routeId: input.routeId,
        message: `Ocorrência registrada: ${OCCURRENCE_TYPE_LABEL[input.type]}`,
      })
    })
    return ref.id
  },

  async resolve(ctx: SessionContext, occurrenceId: string, resolution: string) {
    requireStaff(ctx)
    if (!resolution.trim()) throw new DomainError('Descreva como a ocorrência foi tratada.')
    const ref = docRef(COL.occurrences, occurrenceId)
    await runTransaction(db, async (tx) => {
      const occ = (await tx.get(ref)).data() as Occurrence | undefined
      assertSameOrg(ctx, occ)
      if (occ!.status !== 'OPEN') throw new DomainError('Esta ocorrência já foi resolvida.')
      tx.update(ref, {
        status: 'RESOLVED',
        resolution: resolution.trim(),
        resolvedAt: stamp(),
        resolvedBy: ctx.actor,
      })
      writeHistory(tx, ctx, {
        event: 'OCCURRENCE_RESOLVED',
        orderId: occ!.orderId,
        routeId: occ!.routeId,
        message: `Ocorrência resolvida: ${resolution.trim()}`,
      })
    })
  },
}
