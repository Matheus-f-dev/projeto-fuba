import type { Order, Route, RouteStop, StopStatus } from '@/types/domain'
import { cn } from '@/utils/cn'

/**
 * Trilho da rota: uma linha com cada parada na ordem de entrega.
 * Verde = entregue, vermelho = não entregue, anel azul = próxima parada.
 */

export interface TrackPoint {
  sequence: number
  status: StopStatus
  label?: string
}

/** Monta o trilho a partir das paradas reais (detalhe da rota). */
export function trackFromStops(stops: RouteStop[], ordersById: Map<string, Order>): TrackPoint[] {
  return stops.map((s) => ({
    sequence: s.sequence,
    status: s.status,
    label: ordersById.get(s.orderId)?.recipient.name,
  }))
}

/**
 * Monta o trilho a partir dos pedidos em memória (listas), sem abrir listener de paradas.
 * Posições sem pedido correspondem a pedidos reagendados após falha.
 */
export function trackFromOrders(route: Route, orders: Order[]): TrackPoint[] {
  const bySeq = new Map<number, Order>()
  for (const o of orders) if (o.routeId === route.id && o.routeSequence) bySeq.set(o.routeSequence, o)
  return Array.from({ length: route.stopCount }, (_, i) => {
    const order = bySeq.get(i + 1)
    const status: StopStatus = !order
      ? route.status === 'CANCELLED' ? 'PENDING' : 'FAILED'
      : order.status === 'DELIVERED' ? 'DELIVERED'
      : order.status === 'FAILED' ? 'FAILED'
      : 'PENDING'
    return { sequence: i + 1, status, label: order?.recipient.name }
  })
}

const dotClass: Record<StopStatus, string> = {
  PENDING: 'bg-surface border-[1.5px] border-line-strong',
  ARRIVED: 'bg-accent border-[1.5px] border-accent',
  DELIVERED: 'bg-success border-[1.5px] border-success',
  FAILED: 'bg-danger border-[1.5px] border-danger',
}

const statusWord: Record<StopStatus, string> = {
  PENDING: 'pendente',
  ARRIVED: 'no local',
  DELIVERED: 'entregue',
  FAILED: 'não entregue',
}

export function RouteTrack({
  points,
  live = false,
  size = 'sm',
  className,
}: {
  points: TrackPoint[]
  /** Rota em andamento: destaca a próxima parada. */
  live?: boolean
  size?: 'sm' | 'lg'
  className?: string
}) {
  const nextIndex = live ? points.findIndex((p) => p.status === 'PENDING' || p.status === 'ARRIVED') : -1
  const dense = points.length > 24
  const dot = size === 'lg' ? (dense ? 'size-2.5' : 'size-3') : dense ? 'size-[7px]' : 'size-2'
  const done = points.filter((p) => p.status === 'DELIVERED' || p.status === 'FAILED').length

  if (points.length === 0) return <div className={cn('h-3', className)} />

  return (
    <div
      className={cn('flex w-full items-center', className)}
      role="img"
      aria-label={`${done} de ${points.length} paradas com resultado`}
    >
      {points.map((p, i) => {
        const resolved = p.status === 'DELIVERED' || p.status === 'FAILED'
        const isNext = i === nextIndex
        return (
          <div key={p.sequence} className={cn('flex items-center', i < points.length - 1 && 'flex-1')}>
            <span
              title={`${String(p.sequence).padStart(2, '0')} · ${p.label ?? 'Parada'} · ${isNext ? 'próxima' : statusWord[p.status]}`}
              className={cn(
                'relative shrink-0 rounded-full transition-colors',
                dot,
                isNext ? 'border-[1.5px] border-accent bg-surface ring-[3px] ring-accent/20' : dotClass[p.status],
              )}
            >
              {isNext && <span className="absolute inset-[2px] animate-pulse-dot rounded-full bg-accent" />}
            </span>
            {i < points.length - 1 && (
              <span
                className={cn(
                  'mx-px h-0 min-w-[3px] flex-1 border-t-[1.5px]',
                  resolved && (points[i + 1].status !== 'PENDING' || i + 1 === nextIndex)
                    ? 'border-ink/35'
                    : 'border-dashed border-line-strong',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
