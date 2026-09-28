import { useEffect, useState } from 'react'
import { SkeletonRows } from '@/components/ui/Spinner'
import { useReadySession } from '@/hooks/useSession'
import { historyService } from '@/services/historyService'
import type { HistoryEntry, HistoryEvent } from '@/types/domain'
import { cn } from '@/utils/cn'
import { formatTime } from '@/utils/dates'
import { format, isSameDay } from 'date-fns'

const eventDot: Partial<Record<HistoryEvent, string>> = {
  DELIVERED: 'bg-success',
  PROOF_REGISTERED: 'bg-success/60',
  DELIVERY_FAILED: 'bg-danger',
  ORDER_CANCELLED: 'bg-danger',
  ROUTE_CANCELLED: 'bg-danger',
  OCCURRENCE_OPENED: 'bg-warning',
  OCCURRENCE_RESOLVED: 'bg-warning/60',
  ROUTE_STARTED: 'bg-accent',
  STOP_ARRIVED: 'bg-accent',
  ROUTE_COMPLETED: 'bg-success',
}

type Scope = { orderId: string } | { routeId: string }

export function useHistory(scope: Scope) {
  const { ctx } = useReadySession()
  const [items, setItems] = useState<HistoryEntry[] | null>(null)
  const key = 'orderId' in scope ? `o:${scope.orderId}` : `r:${scope.routeId}`
  useEffect(() => {
    setItems(null)
    const onError = () => setItems([])
    return 'orderId' in scope
      ? historyService.subscribeForOrder(ctx.organizationId, scope.orderId, setItems, onError)
      : historyService.subscribeForRoute(ctx.organizationId, scope.routeId, setItems, onError)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ctx.organizationId])
  return items
}

export function HistoryTimeline({ scope, className }: { scope: Scope; className?: string }) {
  const items = useHistory(scope)
  if (!items) return <SkeletonRows rows={3} />
  if (items.length === 0) return <p className="text-[13px] text-muted">Nenhum evento registrado.</p>

  return (
    <ol className={cn('relative', className)}>
      {items.map((entry, i) => {
        const showDate = i === 0 || !isSameDay(items[i - 1].createdAt, entry.createdAt)
        return (
          <li key={entry.id}>
            {showDate && (
              <p className="eyebrow mt-1 mb-2 pl-[68px]">{format(entry.createdAt, 'dd/MM/yyyy')}</p>
            )}
            <div className="group grid grid-cols-[44px_16px_1fr] gap-x-2 pb-3.5">
              <time className="tnum pt-px text-right font-mono text-xs text-muted">{formatTime(entry.createdAt)}</time>
              <div className="relative flex justify-center">
                <span
                  className={cn(
                    'relative z-10 mt-[5px] size-[7px] rounded-full ring-[3px] ring-surface',
                    eventDot[entry.event] ?? 'bg-ink/40',
                  )}
                />
                {i < items.length - 1 && <span className="absolute top-3 -bottom-3.5 w-px bg-line" />}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] leading-5 text-ink">{entry.message}</p>
                <p className="text-xs text-faint">{entry.changedBy.name}</p>
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
