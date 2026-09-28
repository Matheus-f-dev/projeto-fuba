import {
  getDocs,
  increment,
  query,
  runTransaction,
  where,
  type DocumentReference,
} from 'firebase/firestore'
import {
  ACTIVE_ROUTE_STATUSES,
  assertOrderTransition,
  assertRouteTransition,
  EDITABLE_ROUTE_STATUSES,
  PLANNABLE_ORDER_STATUSES,
} from '@/domain/status'
import { db } from '@/firebase/app'
import { COL, colRef, docRef, newDocRef } from '@/firebase/collections'
import type { Driver, Order, Route, RouteStop, Vehicle } from '@/types/domain'
import { addDaysISO, todayISO } from '@/utils/dates'
import {
  assertSameOrg,
  DomainError,
  requireStaff,
  stamp,
  writeHistory,
  type SessionContext,
} from './context'
import { listen, listenMerged } from './subscribe'

/** Limite de paradas por rota (mantém a transação bem abaixo de 500 escritas). */
export const MAX_STOPS_PER_ROUTE = 80

export interface CreateRouteInput {
  date: string
  orderIds: string[] // na ordem de entrega
  driverId: string | null
  vehicleId: string | null
  plannedStartAt: string | null
  notes: string
}

async function assertResourcesFree(
  ctx: SessionContext,
  driverId: string,
  vehicleId: string,
  exceptRouteId?: string,
) {
  const active = [...ACTIVE_ROUTE_STATUSES].filter((s) => s !== 'DRAFT')
  const [byDriver, byVehicle] = await Promise.all([
    getDocs(
      query(
        colRef(COL.routes),
        where('organizationId', '==', ctx.organizationId),
        where('driverId', '==', driverId),
        where('status', 'in', active),
      ),
    ),
    getDocs(
      query(
        colRef(COL.routes),
        where('organizationId', '==', ctx.organizationId),
        where('vehicleId', '==', vehicleId),
        where('status', 'in', active),
      ),
    ),
  ])
  const busyDriver = byDriver.docs.find((d) => d.id !== exceptRouteId)
  if (busyDriver) throw new DomainError(`Motorista já está na rota ${busyDriver.data().code}.`)
  const busyVehicle = byVehicle.docs.find((d) => d.id !== exceptRouteId)
  if (busyVehicle) throw new DomainError(`Veículo já está na rota ${busyVehicle.data().code}.`)
}

function assertActiveResource(ctx: SessionContext, data: Driver | Vehicle | undefined, label: string) {
  assertSameOrg(ctx, data)
  if (data!.status !== 'ACTIVE') throw new DomainError(`${label} está inativo.`)
}

async function loadStops(ctx: SessionContext, routeId: string) {
  const snap = await getDocs(
    query(
      colRef(COL.routeStops),
      where('organizationId', '==', ctx.organizationId),
      where('routeId', '==', routeId),
    ),
  )
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<RouteStop, 'id'>) }))
    .sort((a, b) => a.sequence - b.sequence)
}

export const routesService = {
  /** Rotas dos últimos 14 dias + qualquer rota ainda ativa. */
  subscribe(organizationId: string, onData: (routes: Route[]) => void, onError: (e: Error) => void) {
    const base = colRef(COL.routes)
    return listenMerged<Route>(
      [
        query(base, where('organizationId', '==', organizationId), where('status', 'in', [...ACTIVE_ROUTE_STATUSES])),
        query(base, where('organizationId', '==', organizationId), where('date', '>=', addDaysISO(todayISO(), -14))),
      ],
      onData,
      onError,
    )
  },

  subscribeStops(
    organizationId: string,
    routeId: string,
    onData: (stops: RouteStop[]) => void,
    onError: (e: Error) => void,
  ) {
    return listen<RouteStop>(
      query(
        colRef(COL.routeStops),
        where('organizationId', '==', organizationId),
        where('routeId', '==', routeId),
      ),
      (stops) => onData(stops.sort((a, b) => a.sequence - b.sequence)),
      onError,
    )
  },

  async create(ctx: SessionContext, input: CreateRouteInput): Promise<{ id: string; code: string }> {
    requireStaff(ctx)
    const orderIds = [...new Set(input.orderIds)]
    if (orderIds.length === 0) throw new DomainError('Selecione ao menos um pedido.')
    if (orderIds.length > MAX_STOPS_PER_ROUTE)
      throw new DomainError(`Uma rota pode ter no máximo ${MAX_STOPS_PER_ROUTE} paradas.`)
    if (Boolean(input.driverId) !== Boolean(input.vehicleId))
      throw new DomainError('Para atribuir a rota, selecione motorista e veículo.')
    const assigned = Boolean(input.driverId && input.vehicleId)
    if (assigned) await assertResourcesFree(ctx, input.driverId!, input.vehicleId!)

    const orgRef = docRef(COL.organizations, ctx.organizationId)
    const routeRef = newDocRef(COL.routes)
    const orderRefs = orderIds.map((id) => docRef(COL.orders, id))

    return runTransaction(db, async (tx) => {
      const [org, driverSnap, vehicleSnap, ...orderSnaps] = await Promise.all([
        tx.get(orgRef),
        assigned ? tx.get(docRef(COL.drivers, input.driverId!)) : Promise.resolve(null),
        assigned ? tx.get(docRef(COL.vehicles, input.vehicleId!)) : Promise.resolve(null),
        ...orderRefs.map((r) => tx.get(r)),
      ])
      if (!org.exists()) throw new DomainError('Organização não encontrada.')
      if (assigned) {
        assertActiveResource(ctx, driverSnap!.data() as Driver | undefined, 'Motorista')
        assertActiveResource(ctx, vehicleSnap!.data() as Vehicle | undefined, 'Veículo')
      }
      const orders = orderSnaps.map((s) => s.data() as Order | undefined)
      orders.forEach((o) => {
        assertSameOrg(ctx, o)
        if (!PLANNABLE_ORDER_STATUSES.includes(o!.status))
          throw new DomainError(`O pedido ${o!.number} não está disponível para planejamento.`)
      })

      const seq = (org.data().routeSeq ?? 0) + 1
      const code = `R-${String(seq).padStart(3, '0')}`
      const routeStatus = assigned ? 'ASSIGNED' : 'DRAFT'
      const orderStatus = assigned ? 'ASSIGNED' : 'PLANNED'

      tx.update(orgRef, { routeSeq: increment(1), updatedAt: stamp() })
      tx.set(routeRef, {
        organizationId: ctx.organizationId,
        code,
        date: input.date,
        status: routeStatus,
        driverId: input.driverId,
        vehicleId: input.vehicleId,
        stopCount: orderIds.length,
        deliveredCount: 0,
        failedCount: 0,
        plannedStartAt: input.plannedStartAt,
        startedAt: null,
        finishedAt: null,
        lastLocation: null,
        notes: input.notes.trim(),
        createdBy: ctx.actor,
        createdAt: stamp(),
        updatedAt: stamp(),
      })
      writeHistory(tx, ctx, {
        event: 'ROUTE_CREATED',
        routeId: routeRef.id,
        newStatus: routeStatus,
        message: `Rota ${code} criada com ${orderIds.length} parada(s)`,
      })

      orders.forEach((order, index) => {
        const stopRef = newDocRef(COL.routeStops)
        const orderId = orderRefs[index].id
        tx.set(stopRef, {
          organizationId: ctx.organizationId,
          routeId: routeRef.id,
          orderId,
          sequence: index + 1,
          status: 'PENDING',
          arrivedAt: null,
          completedAt: null,
          failureReason: null,
          occurrenceId: null,
          proofId: null,
          notes: '',
          createdAt: stamp(),
          updatedAt: stamp(),
        })
        tx.update(orderRefs[index], {
          status: orderStatus,
          routeId: routeRef.id,
          stopId: stopRef.id,
          routeSequence: index + 1,
          driverId: input.driverId,
          vehicleId: input.vehicleId,
          scheduledDate: input.date,
          updatedAt: stamp(),
        })
        writeHistory(tx, ctx, {
          event: 'ADDED_TO_ROUTE',
          orderId,
          routeId: routeRef.id,
          previousStatus: order!.status,
          newStatus: 'PLANNED',
          message: `Adicionado à rota ${code} como parada ${index + 1}`,
        })
        if (assigned)
          writeHistory(tx, ctx, {
            event: 'DRIVER_ASSIGNED',
            orderId,
            routeId: routeRef.id,
            previousStatus: 'PLANNED',
            newStatus: 'ASSIGNED',
            message: 'Motorista e veículo atribuídos',
          })
      })
      return { id: routeRef.id, code }
    })
  },

  /** Atribui (DRAFT → ASSIGNED) ou troca motorista/veículo de rota ainda não iniciada. */
  async assign(ctx: SessionContext, routeId: string, driverId: string, vehicleId: string) {
    requireStaff(ctx)
    if (!driverId || !vehicleId) throw new DomainError('Selecione motorista e veículo.')
    await assertResourcesFree(ctx, driverId, vehicleId, routeId)
    const stops = await loadStops(ctx, routeId)
    const routeRef = docRef(COL.routes, routeId)

    await runTransaction(db, async (tx) => {
      const [routeSnap, driverSnap, vehicleSnap, ...orderSnaps] = await Promise.all([
        tx.get(routeRef),
        tx.get(docRef(COL.drivers, driverId)),
        tx.get(docRef(COL.vehicles, vehicleId)),
        ...stops.map((s) => tx.get(docRef(COL.orders, s.orderId))),
      ])
      const route = routeSnap.data() as Route | undefined
      assertSameOrg(ctx, route)
      assertActiveResource(ctx, driverSnap.data() as Driver | undefined, 'Motorista')
      assertActiveResource(ctx, vehicleSnap.data() as Vehicle | undefined, 'Veículo')
      if (route!.status !== 'DRAFT' && route!.status !== 'ASSIGNED')
        throw new DomainError('Só é possível atribuir rotas que ainda não saíram.')

      const firstAssignment = route!.status === 'DRAFT'
      if (firstAssignment) assertRouteTransition('DRAFT', 'ASSIGNED')
      tx.update(routeRef, { status: 'ASSIGNED', driverId, vehicleId, updatedAt: stamp() })

      orderSnaps.forEach((snap, i) => {
        const order = snap.data() as Order
        const next = firstAssignment ? 'ASSIGNED' : order.status
        if (firstAssignment) assertOrderTransition(order.status, 'ASSIGNED')
        tx.update(snap.ref, { status: next, driverId, vehicleId, updatedAt: stamp() })
        writeHistory(tx, ctx, {
          event: 'DRIVER_ASSIGNED',
          orderId: stops[i].orderId,
          routeId,
          previousStatus: order.status,
          newStatus: next,
          message: firstAssignment ? 'Motorista e veículo atribuídos' : 'Motorista ou veículo alterado',
        })
      })
    })
  },

  async start(ctx: SessionContext, routeId: string) {
    requireStaff(ctx)
    const stops = await loadStops(ctx, routeId)
    const routeRef = docRef(COL.routes, routeId)
    await runTransaction(db, async (tx) => {
      const [routeSnap, ...orderSnaps] = await Promise.all([
        tx.get(routeRef),
        ...stops.map((s) => tx.get(docRef(COL.orders, s.orderId))),
      ])
      const route = routeSnap.data() as Route | undefined
      assertSameOrg(ctx, route)
      assertRouteTransition(route!.status, 'IN_PROGRESS')
      if (!route!.driverId || !route!.vehicleId) throw new DomainError('Atribua motorista e veículo antes de iniciar.')

      tx.update(routeRef, { status: 'IN_PROGRESS', startedAt: stamp(), updatedAt: stamp() })
      writeHistory(tx, ctx, {
        event: 'ROUTE_STARTED',
        routeId,
        previousStatus: route!.status,
        newStatus: 'IN_PROGRESS',
        message: `Rota ${route!.code} iniciada`,
      })
      orderSnaps.forEach((snap, i) => {
        const order = snap.data() as Order
        assertOrderTransition(order.status, 'IN_TRANSIT')
        tx.update(snap.ref, { status: 'IN_TRANSIT', updatedAt: stamp() })
        writeHistory(tx, ctx, {
          event: 'ROUTE_STARTED',
          orderId: stops[i].orderId,
          routeId,
          previousStatus: order.status,
          newStatus: 'IN_TRANSIT',
          message: `Saiu para entrega na rota ${route!.code}`,
        })
      })
    })
  },

  async finish(ctx: SessionContext, routeId: string) {
    requireStaff(ctx)
    const routeRef = docRef(COL.routes, routeId)
    await runTransaction(db, async (tx) => {
      const route = (await tx.get(routeRef)).data() as Route | undefined
      assertSameOrg(ctx, route)
      assertRouteTransition(route!.status, 'COMPLETED')
      const pending = route!.stopCount - route!.deliveredCount - route!.failedCount
      if (pending > 0) throw new DomainError(`Ainda há ${pending} parada(s) sem resultado registrado.`)
      tx.update(routeRef, { status: 'COMPLETED', finishedAt: stamp(), updatedAt: stamp() })
      writeHistory(tx, ctx, {
        event: 'ROUTE_COMPLETED',
        routeId,
        previousStatus: 'IN_PROGRESS',
        newStatus: 'COMPLETED',
        message: `Rota ${route!.code} finalizada: ${route!.deliveredCount} entregue(s), ${route!.failedCount} não entregue(s)`,
      })
    })
  },

  /** Cancela rota que ainda não saiu; os pedidos voltam para a fila de planejamento. */
  async cancel(ctx: SessionContext, routeId: string, reason: string) {
    requireStaff(ctx)
    if (!reason.trim()) throw new DomainError('Informe o motivo do cancelamento.')
    const stops = await loadStops(ctx, routeId)
    const routeRef = docRef(COL.routes, routeId)
    await runTransaction(db, async (tx) => {
      const [routeSnap, ...orderSnaps] = await Promise.all([
        tx.get(routeRef),
        ...stops.map((s) => tx.get(docRef(COL.orders, s.orderId))),
      ])
      const route = routeSnap.data() as Route | undefined
      assertSameOrg(ctx, route)
      assertRouteTransition(route!.status, 'CANCELLED')
      tx.update(routeRef, { status: 'CANCELLED', finishedAt: stamp(), updatedAt: stamp() })
      writeHistory(tx, ctx, {
        event: 'ROUTE_CANCELLED',
        routeId,
        previousStatus: route!.status,
        newStatus: 'CANCELLED',
        message: `Rota ${route!.code} cancelada: ${reason.trim()}`,
      })
      orderSnaps.forEach((snap, i) => releaseOrder(tx, ctx, snap.ref, snap.data() as Order, stops[i].orderId, routeId, `Rota ${route!.code} cancelada`))
    })
  },

  /** Nova sequência de paradas (lista completa de ids na ordem desejada). */
  async reorder(ctx: SessionContext, routeId: string, stopIds: string[]) {
    requireStaff(ctx)
    const stops = await loadStops(ctx, routeId)
    const current = new Set(stops.map((s) => s.id))
    if (stopIds.length !== current.size || !stopIds.every((id) => current.has(id)))
      throw new DomainError('A lista de paradas mudou. Atualize a tela e tente de novo.')
    const routeRef = docRef(COL.routes, routeId)
    await runTransaction(db, async (tx) => {
      const route = (await tx.get(routeRef)).data() as Route | undefined
      assertSameOrg(ctx, route)
      if (!EDITABLE_ROUTE_STATUSES.includes(route!.status))
        throw new DomainError('A sequência só pode ser alterada antes da rota sair.')
      const byId = new Map(stops.map((s) => [s.id, s]))
      stopIds.forEach((id, index) => {
        tx.update(docRef(COL.routeStops, id), { sequence: index + 1, updatedAt: stamp() })
        tx.update(docRef(COL.orders, byId.get(id)!.orderId), { routeSequence: index + 1, updatedAt: stamp() })
      })
      tx.update(routeRef, { updatedAt: stamp() })
      writeHistory(tx, ctx, {
        event: 'ROUTE_RESEQUENCED',
        routeId,
        message: `Sequência de paradas da rota ${route!.code} alterada`,
      })
    })
  },

  async removeStop(ctx: SessionContext, routeId: string, stopId: string) {
    requireStaff(ctx)
    const stops = await loadStops(ctx, routeId)
    const stop = stops.find((s) => s.id === stopId)
    if (!stop) throw new DomainError('Parada não encontrada.')
    if (stops.length === 1) throw new DomainError('Esta é a única parada. Cancele a rota em vez de removê-la.')
    const routeRef = docRef(COL.routes, routeId)
    const orderRef = docRef(COL.orders, stop.orderId)
    await runTransaction(db, async (tx) => {
      const [routeSnap, orderSnap] = await Promise.all([tx.get(routeRef), tx.get(orderRef)])
      const route = routeSnap.data() as Route | undefined
      assertSameOrg(ctx, route)
      if (!EDITABLE_ROUTE_STATUSES.includes(route!.status))
        throw new DomainError('Paradas só podem ser removidas antes da rota sair.')
      tx.delete(docRef(COL.routeStops, stopId))
      stops
        .filter((s) => s.id !== stopId)
        .forEach((s, index) => {
          if (s.sequence !== index + 1) {
            tx.update(docRef(COL.routeStops, s.id), { sequence: index + 1, updatedAt: stamp() })
            tx.update(docRef(COL.orders, s.orderId), { routeSequence: index + 1, updatedAt: stamp() })
          }
        })
      tx.update(routeRef, { stopCount: increment(-1), updatedAt: stamp() })
      releaseOrder(tx, ctx, orderRef, orderSnap.data() as Order, stop.orderId, routeId, `Removido da rota ${route!.code}`)
    })
  },
}

function releaseOrder(
  tx: Parameters<Parameters<typeof runTransaction>[1]>[0],
  ctx: SessionContext,
  ref: DocumentReference,
  order: Order,
  orderId: string,
  routeId: string,
  message: string,
) {
  assertOrderTransition(order.status, 'CREATED')
  tx.update(ref, {
    status: 'CREATED',
    routeId: null,
    stopId: null,
    routeSequence: null,
    driverId: null,
    vehicleId: null,
    updatedAt: stamp(),
  })
  writeHistory(tx, ctx, {
    event: 'REMOVED_FROM_ROUTE',
    orderId,
    routeId,
    previousStatus: order.status,
    newStatus: 'CREATED',
    message,
  })
}
