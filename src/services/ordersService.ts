import { increment, query, runTransaction, where } from 'firebase/firestore'
import { assertOrderTransition, OPEN_ORDER_STATUSES } from '@/domain/status'
import { db } from '@/firebase/app'
import { COL, colRef, docRef, newDocRef } from '@/firebase/collections'
import type { Address, GeoPoint, Order, TimeWindow } from '@/types/domain'
import { daysAgo } from '@/utils/dates'
import {
  assertSameOrg,
  DomainError,
  requireStaff,
  stamp,
  writeHistory,
  type SessionContext,
} from './context'
import { listenMerged } from './subscribe'

export interface OrderInput {
  reference: string
  notes: string
  recipient: { name: string; phone: string }
  address: Address
  location: GeoPoint | null
  scheduledDate: string
  timeWindow: TimeWindow | null
  deliveryNotes: string
}

/** Status em que endereço e destinatário ainda podem ser alterados. */
export const EDITABLE_ORDER_STATUSES = ['CREATED', 'PLANNED', 'ASSIGNED', 'FAILED'] as const

export function validateOrderInput(input: OrderInput): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!input.recipient.name.trim()) errors['recipient.name'] = 'Informe o nome do destinatário.'
  const phone = input.recipient.phone.replace(/\D/g, '')
  if (phone.length < 10 || phone.length > 11) errors['recipient.phone'] = 'Telefone com DDD, 10 ou 11 dígitos.'
  if (input.address.zipCode.replace(/\D/g, '').length !== 8) errors['address.zipCode'] = 'CEP com 8 dígitos.'
  if (!input.address.street.trim()) errors['address.street'] = 'Informe o logradouro.'
  if (!input.address.number.trim()) errors['address.number'] = 'Informe o número ou "S/N".'
  if (!input.address.district.trim()) errors['address.district'] = 'Informe o bairro.'
  if (!input.address.city.trim()) errors['address.city'] = 'Informe a cidade.'
  if (!/^[A-Z]{2}$/.test(input.address.state)) errors['address.state'] = 'UF com 2 letras.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledDate)) errors.scheduledDate = 'Informe a data prevista.'
  if (input.timeWindow) {
    const { start, end } = input.timeWindow
    if (!start || !end) errors.timeWindow = 'Preencha início e fim da janela.'
    else if (start >= end) errors.timeWindow = 'O fim da janela precisa ser depois do início.'
  }
  if (input.location) {
    const { lat, lng } = input.location
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) errors.location = 'Coordenadas inválidas.'
  }
  return errors
}

function sanitize(input: OrderInput) {
  return {
    reference: input.reference.trim(),
    notes: input.notes.trim(),
    recipient: { name: input.recipient.name.trim(), phone: input.recipient.phone.replace(/\D/g, '') },
    address: {
      zipCode: input.address.zipCode.replace(/\D/g, ''),
      street: input.address.street.trim(),
      number: input.address.number.trim(),
      complement: input.address.complement.trim(),
      district: input.address.district.trim(),
      city: input.address.city.trim(),
      state: input.address.state.trim().toUpperCase(),
    },
    location: input.location,
    scheduledDate: input.scheduledDate,
    timeWindow: input.timeWindow,
    deliveryNotes: input.deliveryNotes.trim(),
  }
}

function assertValid(input: OrderInput) {
  const errors = validateOrderInput(input)
  const first = Object.values(errors)[0]
  if (first) throw new DomainError(first)
}

export const ordersService = {
  /**
   * Pedidos em aberto (qualquer data) + pedidos alterados nos últimos 30 dias.
   * Mantém a operação corrente em memória sem ler o histórico inteiro.
   */
  subscribe(organizationId: string, onData: (orders: Order[]) => void, onError: (e: Error) => void) {
    const base = colRef(COL.orders)
    return listenMerged<Order>(
      [
        query(base, where('organizationId', '==', organizationId), where('status', 'in', [...OPEN_ORDER_STATUSES])),
        query(base, where('organizationId', '==', organizationId), where('updatedAt', '>=', daysAgo(30))),
      ],
      onData,
      onError,
    )
  },

  async create(ctx: SessionContext, input: OrderInput): Promise<{ id: string; number: string }> {
    requireStaff(ctx)
    assertValid(input)
    const data = sanitize(input)
    const orgRef = docRef(COL.organizations, ctx.organizationId)
    const orderRef = newDocRef(COL.orders)

    return runTransaction(db, async (tx) => {
      const org = await tx.get(orgRef)
      if (!org.exists()) throw new DomainError('Organização não encontrada.')
      const seq = (org.data().orderSeq ?? 0) + 1
      const number = `PED-${String(seq).padStart(4, '0')}`

      tx.update(orgRef, { orderSeq: increment(1), updatedAt: stamp() })
      tx.set(orderRef, {
        ...data,
        organizationId: ctx.organizationId,
        number,
        status: 'CREATED',
        routeId: null,
        stopId: null,
        routeSequence: null,
        driverId: null,
        vehicleId: null,
        attempts: 0,
        proof: null,
        deliveredAt: null,
        createdBy: ctx.actor,
        createdAt: stamp(),
        updatedAt: stamp(),
      })
      writeHistory(tx, ctx, {
        event: 'ORDER_CREATED',
        orderId: orderRef.id,
        newStatus: 'CREATED',
        message: `Pedido ${number} criado`,
      })
      return { id: orderRef.id, number }
    })
  },

  async update(ctx: SessionContext, orderId: string, input: OrderInput) {
    requireStaff(ctx)
    assertValid(input)
    const data = sanitize(input)
    const ref = docRef(COL.orders, orderId)
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref)
      const order = snap.data() as Order | undefined
      assertSameOrg(ctx, order)
      if (!(EDITABLE_ORDER_STATUSES as readonly string[]).includes(order!.status))
        throw new DomainError('Pedidos em rota, entregues ou cancelados não podem ser editados.')
      tx.update(ref, { ...data, updatedAt: stamp() })
      writeHistory(tx, ctx, {
        event: 'ORDER_UPDATED',
        orderId,
        message: 'Dados do pedido atualizados',
      })
    })
  },

  async cancel(ctx: SessionContext, orderId: string, reason: string) {
    requireStaff(ctx)
    if (!reason.trim()) throw new DomainError('Informe o motivo do cancelamento.')
    const ref = docRef(COL.orders, orderId)
    await runTransaction(db, async (tx) => {
      const order = (await tx.get(ref)).data() as Order | undefined
      assertSameOrg(ctx, order)
      if (order!.status === 'PLANNED' || order!.status === 'ASSIGNED')
        throw new DomainError('Remova o pedido da rota antes de cancelar.')
      assertOrderTransition(order!.status, 'CANCELLED')
      tx.update(ref, { status: 'CANCELLED', updatedAt: stamp() })
      writeHistory(tx, ctx, {
        event: 'ORDER_CANCELLED',
        orderId,
        previousStatus: order!.status,
        newStatus: 'CANCELLED',
        message: `Pedido cancelado: ${reason.trim()}`,
      })
    })
  },

  /** Pedido não entregue volta para a fila de planejamento com nova data. */
  async reschedule(ctx: SessionContext, orderId: string, scheduledDate: string) {
    requireStaff(ctx)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) throw new DomainError('Informe a nova data.')
    const ref = docRef(COL.orders, orderId)
    await runTransaction(db, async (tx) => {
      const order = (await tx.get(ref)).data() as Order | undefined
      assertSameOrg(ctx, order)
      assertOrderTransition(order!.status, 'CREATED')
      if (order!.status !== 'FAILED') throw new DomainError('Somente pedidos não entregues podem ser reagendados.')
      tx.update(ref, {
        status: 'CREATED',
        scheduledDate,
        routeId: null,
        stopId: null,
        routeSequence: null,
        driverId: null,
        vehicleId: null,
        updatedAt: stamp(),
      })
      writeHistory(tx, ctx, {
        event: 'ORDER_RESCHEDULED',
        orderId,
        previousStatus: 'FAILED',
        newStatus: 'CREATED',
        message: `Nova tentativa agendada para ${scheduledDate.split('-').reverse().join('/')}`,
      })
    })
  },
}
