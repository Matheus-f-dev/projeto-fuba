import type {
  OccurrenceStatus,
  OccurrenceType,
  OrderStatus,
  RouteStatus,
  StopStatus,
  VehicleType,
} from '@/types/domain'

/**
 * Máquinas de estado do domínio. Toda mudança de status passa por aqui
 * (services) e é revalidada pelas regras do Firestore (firestore.rules),
 * que espelham estas mesmas tabelas. Se alterar uma, altere a outra.
 */

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  // CREATED → ASSIGNED: rota criada já com motorista (o histórico registra as duas etapas)
  CREATED: ['PLANNED', 'ASSIGNED', 'CANCELLED'],
  PLANNED: ['ASSIGNED', 'CREATED'],
  ASSIGNED: ['IN_TRANSIT', 'CREATED'],
  IN_TRANSIT: ['DELIVERED', 'FAILED'],
  FAILED: ['CREATED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
}

export const ROUTE_TRANSITIONS: Record<RouteStatus, readonly RouteStatus[]> = {
  DRAFT: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
}

export const STOP_TRANSITIONS: Record<StopStatus, readonly StopStatus[]> = {
  PENDING: ['ARRIVED', 'DELIVERED', 'FAILED'],
  ARRIVED: ['DELIVERED', 'FAILED'],
  DELIVERED: [],
  FAILED: [],
}

export class InvalidTransitionError extends Error {
  constructor(entity: string, from: string, to: string) {
    super(`Transição inválida de ${entity}: ${from} → ${to}`)
    this.name = 'InvalidTransitionError'
  }
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus) {
  return ORDER_TRANSITIONS[from].includes(to)
}
export function canTransitionRoute(from: RouteStatus, to: RouteStatus) {
  return ROUTE_TRANSITIONS[from].includes(to)
}
export function canTransitionStop(from: StopStatus, to: StopStatus) {
  return STOP_TRANSITIONS[from].includes(to)
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus) {
  if (!canTransitionOrder(from, to)) throw new InvalidTransitionError('pedido', from, to)
}
export function assertRouteTransition(from: RouteStatus, to: RouteStatus) {
  if (!canTransitionRoute(from, to)) throw new InvalidTransitionError('rota', from, to)
}
export function assertStopTransition(from: StopStatus, to: StopStatus) {
  if (!canTransitionStop(from, to)) throw new InvalidTransitionError('parada', from, to)
}

/** Pedidos que podem entrar em uma nova rota. */
export const PLANNABLE_ORDER_STATUSES: readonly OrderStatus[] = ['CREATED']
/** Pedidos ainda em aberto na operação. */
export const OPEN_ORDER_STATUSES: readonly OrderStatus[] = [
  'CREATED',
  'PLANNED',
  'ASSIGNED',
  'IN_TRANSIT',
  'FAILED',
]
export const ACTIVE_ROUTE_STATUSES: readonly RouteStatus[] = ['DRAFT', 'ASSIGNED', 'IN_PROGRESS']
/** Rota pode ter paradas reordenadas ou removidas. */
export const EDITABLE_ROUTE_STATUSES: readonly RouteStatus[] = ['DRAFT', 'ASSIGNED']

export function isStopResolved(status: StopStatus) {
  return status === 'DELIVERED' || status === 'FAILED'
}

// ——— Apresentação ———————————————————————————————————————————————

export type Tone = 'neutral' | 'slate' | 'violet' | 'accent' | 'success' | 'warning' | 'danger'

interface StatusMeta {
  label: string
  tone: Tone
}

export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta> = {
  CREATED: { label: 'Aguardando rota', tone: 'neutral' },
  PLANNED: { label: 'Em planejamento', tone: 'slate' },
  ASSIGNED: { label: 'Atribuído', tone: 'violet' },
  IN_TRANSIT: { label: 'Em rota', tone: 'accent' },
  DELIVERED: { label: 'Entregue', tone: 'success' },
  FAILED: { label: 'Não entregue', tone: 'danger' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral' },
}

export const ROUTE_STATUS_META: Record<RouteStatus, StatusMeta> = {
  DRAFT: { label: 'Rascunho', tone: 'neutral' },
  ASSIGNED: { label: 'Pronta para sair', tone: 'violet' },
  IN_PROGRESS: { label: 'Em andamento', tone: 'accent' },
  COMPLETED: { label: 'Concluída', tone: 'success' },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' },
}

export const STOP_STATUS_META: Record<StopStatus, StatusMeta> = {
  PENDING: { label: 'Pendente', tone: 'neutral' },
  ARRIVED: { label: 'No local', tone: 'accent' },
  DELIVERED: { label: 'Entregue', tone: 'success' },
  FAILED: { label: 'Não entregue', tone: 'danger' },
}

export const OCCURRENCE_TYPE_LABEL: Record<OccurrenceType, string> = {
  DESTINATARIO_AUSENTE: 'Destinatário ausente',
  ENDERECO_NAO_LOCALIZADO: 'Endereço não localizado',
  RECUSA_RECEBIMENTO: 'Recusa de recebimento',
  VEICULO_PROBLEMA: 'Problema no veículo',
  OUTRO: 'Outro',
}

export const OCCURRENCE_STATUS_META: Record<OccurrenceStatus, StatusMeta> = {
  OPEN: { label: 'Em aberto', tone: 'warning' },
  RESOLVED: { label: 'Resolvida', tone: 'neutral' },
}

/** Tipos que representam falha de entrega (encerram a parada). */
export const DELIVERY_FAILURE_TYPES: readonly OccurrenceType[] = [
  'DESTINATARIO_AUSENTE',
  'ENDERECO_NAO_LOCALIZADO',
  'RECUSA_RECEBIMENTO',
  'OUTRO',
]

export const VEHICLE_TYPE_LABEL: Record<VehicleType, string> = {
  MOTO: 'Moto',
  CARRO: 'Carro',
  UTILITARIO: 'Utilitário',
  VAN: 'Van',
  CAMINHAO: 'Caminhão leve',
}

export const ROLE_LABEL = {
  ADMIN: 'Administrador',
  OPERATOR: 'Operador',
  DRIVER: 'Motorista',
} as const

/** Etapas mostradas na régua de progresso do pedido. */
export const ORDER_PROGRESS_STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'CREATED', label: 'Pedido criado' },
  { status: 'PLANNED', label: 'Planejado' },
  { status: 'ASSIGNED', label: 'Motorista atribuído' },
  { status: 'IN_TRANSIT', label: 'Em rota' },
  { status: 'DELIVERED', label: 'Entregue' },
]
