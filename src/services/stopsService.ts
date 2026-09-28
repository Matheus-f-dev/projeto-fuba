import { increment, runTransaction } from 'firebase/firestore'
import { assertOrderTransition, assertStopTransition, OCCURRENCE_TYPE_LABEL } from '@/domain/status'
import { db } from '@/firebase/app'
import { COL, docRef, newDocRef } from '@/firebase/collections'
import type { GeoPoint, OccurrenceType, Order, Route, RouteStop } from '@/types/domain'
import type { ProcessedImage } from '@/utils/compressImage'
import { assertSameOrg, DomainError, requireStaff, stamp, writeHistory, type SessionContext } from './context'
import { deliveryProofService } from './deliveryProofService'

/**
 * Execução das paradas. Hoje acionado pelo painel (operador registrando pelo motorista);
 * o app do motorista usará as mesmas operações.
 */

export interface DeliverInput {
  recipientName: string
  notes: string
  image: ProcessedImage | null
  location: GeoPoint | null
}

export interface FailInput {
  type: OccurrenceType
  description: string
}

async function withStop(
  ctx: SessionContext,
  stopId: string,
  fn: (args: {
    tx: Parameters<Parameters<typeof runTransaction>[1]>[0]
    stop: RouteStop
    route: Route
    order: Order
  }) => void,
) {
  requireStaff(ctx)
  const stopRef = docRef(COL.routeStops, stopId)
  await runTransaction(db, async (tx) => {
    const stopSnap = await tx.get(stopRef)
    const stopData = stopSnap.data() as Omit<RouteStop, 'id'> | undefined
    assertSameOrg(ctx, stopData)
    const [routeSnap, orderSnap] = await Promise.all([
      tx.get(docRef(COL.routes, stopData!.routeId)),
      tx.get(docRef(COL.orders, stopData!.orderId)),
    ])
    const route = { id: routeSnap.id, ...(routeSnap.data() as Omit<Route, 'id'>) }
    const order = { id: orderSnap.id, ...(orderSnap.data() as Omit<Order, 'id'>) }
    if (route.status !== 'IN_PROGRESS') throw new DomainError('A rota precisa estar em andamento.')
    fn({ tx, stop: { id: stopId, ...stopData! }, route, order })
  })
}

export const stopsService = {
  arrive(ctx: SessionContext, stopId: string) {
    return withStop(ctx, stopId, ({ tx, stop, route, order }) => {
      assertStopTransition(stop.status, 'ARRIVED')
      tx.update(docRef(COL.routeStops, stop.id), { status: 'ARRIVED', arrivedAt: stamp(), updatedAt: stamp() })
      tx.update(docRef(COL.routes, route.id), { updatedAt: stamp() })
      writeHistory(tx, ctx, {
        event: 'STOP_ARRIVED',
        orderId: order.id,
        routeId: route.id,
        message: `Motorista chegou ao destino (parada ${stop.sequence})`,
      })
    })
  },

  deliver(ctx: SessionContext, stopId: string, input: DeliverInput) {
    return withStop(ctx, stopId, ({ tx, stop, route, order }) => {
      assertStopTransition(stop.status, 'DELIVERED')
      assertOrderTransition(order.status, 'DELIVERED')

      const proof = deliveryProofService.save(tx, ctx, {
        orderId: order.id,
        routeId: route.id,
        stopId: stop.id,
        driverId: route.driverId,
        recipientName: input.recipientName,
        notes: input.notes,
        image: input.image,
        location: input.location,
      })

      tx.update(docRef(COL.routeStops, stop.id), {
        status: 'DELIVERED',
        completedAt: stamp(),
        proofId: proof.id,
        notes: input.notes.trim(),
        updatedAt: stamp(),
      })
      tx.update(docRef(COL.orders, order.id), {
        status: 'DELIVERED',
        deliveredAt: stamp(),
        proof: { ...proof, deliveredAt: stamp() },
        updatedAt: stamp(),
      })
      tx.update(docRef(COL.routes, route.id), { deliveredCount: increment(1), updatedAt: stamp() })
      writeHistory(tx, ctx, {
        event: 'DELIVERED',
        orderId: order.id,
        routeId: route.id,
        previousStatus: order.status,
        newStatus: 'DELIVERED',
        message: `Entrega realizada. Recebido por ${proof.recipientName}`,
      })
      writeHistory(tx, ctx, {
        event: 'PROOF_REGISTERED',
        orderId: order.id,
        routeId: route.id,
        message: proof.hasImage ? 'Comprovante registrado com foto' : 'Comprovante registrado sem foto',
      })
    })
  },

  fail(ctx: SessionContext, stopId: string, input: FailInput) {
    if (!input.description.trim()) throw new DomainError('Descreva o que aconteceu.')
    return withStop(ctx, stopId, ({ tx, stop, route, order }) => {
      assertStopTransition(stop.status, 'FAILED')
      assertOrderTransition(order.status, 'FAILED')
      const occurrenceRef = newDocRef(COL.occurrences)
      tx.set(occurrenceRef, {
        organizationId: ctx.organizationId,
        type: input.type,
        description: input.description.trim(),
        status: 'OPEN',
        orderId: order.id,
        routeId: route.id,
        stopId: stop.id,
        driverId: route.driverId,
        createdBy: ctx.actor,
        createdAt: stamp(),
        resolvedAt: null,
        resolvedBy: null,
        resolution: '',
      })
      tx.update(docRef(COL.routeStops, stop.id), {
        status: 'FAILED',
        completedAt: stamp(),
        failureReason: input.type,
        occurrenceId: occurrenceRef.id,
        updatedAt: stamp(),
      })
      tx.update(docRef(COL.orders, order.id), {
        status: 'FAILED',
        attempts: increment(1),
        updatedAt: stamp(),
      })
      tx.update(docRef(COL.routes, route.id), { failedCount: increment(1), updatedAt: stamp() })
      writeHistory(tx, ctx, {
        event: 'DELIVERY_FAILED',
        orderId: order.id,
        routeId: route.id,
        previousStatus: order.status,
        newStatus: 'FAILED',
        message: `Entrega não realizada: ${OCCURRENCE_TYPE_LABEL[input.type]}`,
      })
    })
  },
}
