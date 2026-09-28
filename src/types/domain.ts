// Tipos de domínio. Datas já chegam convertidas para Date pelos services.

export type UserRole = 'ADMIN' | 'OPERATOR' | 'DRIVER'
export type ActiveStatus = 'ACTIVE' | 'INACTIVE'

export type OrderStatus =
  | 'CREATED'
  | 'PLANNED'
  | 'ASSIGNED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'FAILED'
  | 'CANCELLED'

export type RouteStatus = 'DRAFT' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

export type StopStatus = 'PENDING' | 'ARRIVED' | 'DELIVERED' | 'FAILED'

export type OccurrenceType =
  | 'DESTINATARIO_AUSENTE'
  | 'ENDERECO_NAO_LOCALIZADO'
  | 'RECUSA_RECEBIMENTO'
  | 'VEICULO_PROBLEMA'
  | 'OUTRO'

export type OccurrenceStatus = 'OPEN' | 'RESOLVED'

export type VehicleType = 'MOTO' | 'CARRO' | 'UTILITARIO' | 'VAN' | 'CAMINHAO'

export interface GeoPoint {
  lat: number
  lng: number
}

export interface LastLocation extends GeoPoint {
  accuracy: number | null
  recordedAt: Date
}

export interface ActorRef {
  uid: string
  name: string
}

export interface Organization {
  id: string
  name: string
  document: string
  status: ActiveStatus
  orderSeq: number
  routeSeq: number
  createdAt: Date
  updatedAt: Date
}

export interface AppUser {
  id: string
  organizationId: string
  name: string
  email: string
  phone: string
  role: UserRole
  status: ActiveStatus
  createdAt: Date
  updatedAt: Date
}

export interface Address {
  zipCode: string
  street: string
  number: string
  complement: string
  district: string
  city: string
  state: string
}

export interface TimeWindow {
  start: string // HH:mm
  end: string // HH:mm
}

/** Resumo do comprovante gravado no pedido, para não carregar a imagem em listagens. */
export interface ProofSummary {
  id: string
  recipientName: string
  hasImage: boolean
  deliveredAt: Date
}

export interface Order {
  id: string
  organizationId: string
  number: string
  reference: string
  notes: string
  recipient: { name: string; phone: string }
  address: Address
  location: GeoPoint | null
  scheduledDate: string // YYYY-MM-DD
  timeWindow: TimeWindow | null
  deliveryNotes: string
  status: OrderStatus
  routeId: string | null
  stopId: string | null
  /** Posição da parada na rota (espelha RouteStop.sequence). */
  routeSequence: number | null
  driverId: string | null
  vehicleId: string | null
  attempts: number
  proof: ProofSummary | null
  deliveredAt: Date | null
  createdBy: ActorRef
  createdAt: Date
  updatedAt: Date
}

export interface Route {
  id: string
  organizationId: string
  code: string
  date: string // YYYY-MM-DD
  status: RouteStatus
  driverId: string | null
  vehicleId: string | null
  stopCount: number
  deliveredCount: number
  failedCount: number
  plannedStartAt: string | null // HH:mm
  startedAt: Date | null
  finishedAt: Date | null
  lastLocation: LastLocation | null
  notes: string
  createdBy: ActorRef
  createdAt: Date
  updatedAt: Date
}

export interface RouteStop {
  id: string
  organizationId: string
  routeId: string
  orderId: string
  sequence: number
  status: StopStatus
  arrivedAt: Date | null
  completedAt: Date | null
  failureReason: OccurrenceType | null
  occurrenceId: string | null
  proofId: string | null
  notes: string
  createdAt: Date
  updatedAt: Date
}

export interface Driver {
  id: string
  organizationId: string
  userId: string | null
  name: string
  phone: string
  document: string
  license: string
  licenseCategory: string
  status: ActiveStatus
  createdAt: Date
  updatedAt: Date
}

export interface Vehicle {
  id: string
  organizationId: string
  plate: string
  model: string
  type: VehicleType
  capacityKg: number | null
  capacityVolumes: number | null
  status: ActiveStatus
  createdAt: Date
  updatedAt: Date
}

export interface Occurrence {
  id: string
  organizationId: string
  type: OccurrenceType
  description: string
  status: OccurrenceStatus
  orderId: string | null
  routeId: string | null
  stopId: string | null
  driverId: string | null
  createdBy: ActorRef
  createdAt: Date
  resolvedAt: Date | null
  resolvedBy: ActorRef | null
  resolution: string
}

export interface DeliveryProof {
  id: string
  organizationId: string
  orderId: string
  routeId: string | null
  stopId: string | null
  driverId: string | null
  recipientName: string
  notes: string
  imageData: string | null // data URL base64
  imageMimeType: string | null
  imageBytes: number | null
  latitude: number | null
  longitude: number | null
  createdBy: ActorRef
  createdAt: Date
}

export type HistoryEvent =
  | 'ORDER_CREATED'
  | 'ORDER_UPDATED'
  | 'ORDER_CANCELLED'
  | 'ORDER_RESCHEDULED'
  | 'ADDED_TO_ROUTE'
  | 'REMOVED_FROM_ROUTE'
  | 'DRIVER_ASSIGNED'
  | 'ROUTE_CREATED'
  | 'ROUTE_STARTED'
  | 'ROUTE_COMPLETED'
  | 'ROUTE_CANCELLED'
  | 'ROUTE_RESEQUENCED'
  | 'STOP_ARRIVED'
  | 'DELIVERED'
  | 'DELIVERY_FAILED'
  | 'PROOF_REGISTERED'
  | 'OCCURRENCE_OPENED'
  | 'OCCURRENCE_RESOLVED'

export interface HistoryEntry {
  id: string
  organizationId: string
  event: HistoryEvent
  orderId: string | null
  routeId: string | null
  previousStatus: string | null
  newStatus: string | null
  message: string
  changedBy: ActorRef
  createdAt: Date
}

export interface LocationPoint {
  id: string
  organizationId: string
  routeId: string
  driverId: string
  lat: number
  lng: number
  accuracy: number | null
  recordedAt: Date
}
