import { query, where } from 'firebase/firestore'
import { COL, colRef } from '@/firebase/collections'
import type { HistoryEntry, HistoryEvent } from '@/types/domain'
import { listen } from './subscribe'

/**
 * Eventos gravados na mesma transação têm o mesmo horário do servidor;
 * o desempate segue a ordem lógica do fluxo.
 */
const EVENT_ORDER: HistoryEvent[] = [
  'ORDER_CREATED', 'ORDER_UPDATED', 'ROUTE_CREATED', 'ADDED_TO_ROUTE', 'DRIVER_ASSIGNED', 'ROUTE_RESEQUENCED',
  'REMOVED_FROM_ROUTE', 'ROUTE_STARTED', 'STOP_ARRIVED', 'DELIVERED', 'DELIVERY_FAILED', 'PROOF_REGISTERED',
  'OCCURRENCE_OPENED', 'OCCURRENCE_RESOLVED', 'ROUTE_COMPLETED', 'ROUTE_CANCELLED', 'ORDER_RESCHEDULED', 'ORDER_CANCELLED',
]

const byTime = (a: HistoryEntry, b: HistoryEntry) =>
  a.createdAt.getTime() - b.createdAt.getTime() ||
  EVENT_ORDER.indexOf(a.event) - EVENT_ORDER.indexOf(b.event) ||
  a.message.localeCompare(b.message, 'pt-BR', { numeric: true })

/** Histórico é somente leitura aqui: as escritas acontecem junto de cada alteração (writeHistory). */
export const historyService = {
  subscribeForOrder(
    organizationId: string,
    orderId: string,
    onData: (items: HistoryEntry[]) => void,
    onError: (e: Error) => void,
  ) {
    return listen<HistoryEntry>(
      query(colRef(COL.statusHistory), where('organizationId', '==', organizationId), where('orderId', '==', orderId)),
      (items) => onData(items.sort(byTime)),
      onError,
    )
  },

  subscribeForRoute(
    organizationId: string,
    routeId: string,
    onData: (items: HistoryEntry[]) => void,
    onError: (e: Error) => void,
  ) {
    return listen<HistoryEntry>(
      query(colRef(COL.statusHistory), where('organizationId', '==', organizationId), where('routeId', '==', routeId)),
      (items) => onData(items.sort(byTime)),
      onError,
    )
  },
}
