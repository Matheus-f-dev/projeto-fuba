import { ArrowRight, Radar } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { MapView, type MapMarker, type MapPath } from '@/components/map/MapView'
import { EmptyState } from '@/components/ui/misc'
import { Plate } from '@/components/ui/Plate'
import { SkeletonRows } from '@/components/ui/Spinner'
import { RouteTrack, trackFromOrders } from '@/features/routes/RouteTrack'
import { useOperationData } from '@/hooks/useOperationData'
import { useOrderSheet } from '@/hooks/useSelectors'
import type { Order } from '@/types/domain'
import { cn } from '@/utils/cn'
import { timeAgo } from '@/utils/dates'
import { firstName } from '@/utils/format'

const STALE_MS = 10 * 60 * 1000

function stopVariant(order: Order, isNext: boolean): MapMarker['variant'] {
  if (order.status === 'DELIVERED') return 'stop-delivered'
  if (order.status === 'FAILED') return 'stop-failed'
  return isNext ? 'stop-next' : 'stop-pending'
}

export function MonitoringPage() {
  const { routes, orders, drivers, vehicles, occurrences } = useOperationData()
  const { open: openOrder } = useOrderSheet()
  const [focusId, setFocusId] = useState<string | null>(null)

  const active = useMemo(
    () => routes.items.filter((r) => r.status === 'IN_PROGRESS').sort((a, b) => a.code.localeCompare(b.code)),
    [routes.items],
  )
  const focused = focusId ? active.find((r) => r.id === focusId) : undefined

  const ordersByRoute = useMemo(() => {
    const map = new Map<string, Order[]>()
    for (const o of orders.items) {
      if (!o.routeId) continue
      const list = map.get(o.routeId) ?? []
      list.push(o)
      map.set(o.routeId, list)
    }
    for (const list of map.values()) list.sort((a, b) => (a.routeSequence ?? 0) - (b.routeSequence ?? 0))
    return map
  }, [orders.items])

  const { markers, paths } = useMemo(() => {
    const markers: MapMarker[] = []
    const paths: MapPath[] = []
    for (const r of focused ? [focused] : active) {
      const list = ordersByRoute.get(r.id) ?? []
      const next = list.find((o) => o.status === 'IN_TRANSIT')
      for (const o of list) {
        if (!o.location) continue
        markers.push({
          id: `${r.id}:${o.id}`,
          position: o.location,
          variant: stopVariant(o, o.id === next?.id),
          label: focused ? String(o.routeSequence ?? '') : undefined,
          title: `${r.code} · ${o.routeSequence}. ${o.recipient.name}`,
          onClick: () => openOrder(o.id),
        })
      }
      if (r.lastLocation) {
        const driver = r.driverId ? drivers.byId.get(r.driverId) : undefined
        markers.push({
          id: `driver:${r.id}`,
          position: r.lastLocation,
          variant: 'driver',
          title: `${driver?.name ?? 'Motorista'} · ${r.code} · ${timeAgo(r.lastLocation.recordedAt)}`,
          onClick: () => setFocusId(r.id),
        })
      }
      if (focused) {
        const pts = list.filter((o) => o.location).map((o) => o.location!)
        if (pts.length > 1) paths.push({ id: `plan:${r.id}`, points: pts, variant: 'planned' })
      }
    }
    return { markers, paths }
  }, [active, focused, ordersByRoute, drivers.byId, openOrder])

  const openByRoute = (routeId: string) => occurrences.items.filter((o) => o.routeId === routeId && o.status === 'OPEN').length

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex flex-wrap items-end gap-4 border-b border-line bg-surface px-4 py-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[22px] leading-7 font-semibold tracking-[-0.02em]">Monitoramento</h1>
          <p className="mt-1 text-[13px] text-muted">
            Posição dos motoristas e andamento das rotas em tempo real.
          </p>
        </div>
        {focused && (
          <button type="button" onClick={() => setFocusId(null)} className="text-[13px] font-medium text-accent-ink hover:underline">
            Mostrar todas as rotas
          </button>
        )}
      </header>

      <div className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative min-h-[420px]">
          <MapView className="absolute inset-0" markers={markers} paths={paths} fitKey={`${focusId ?? 'all'}|${active.length}`} />
          <div className="pointer-events-none absolute top-3 left-3 z-[500] flex flex-wrap gap-3 rounded-md bg-surface/95 px-2.5 py-1.5 text-2xs text-muted shadow-sm">
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full border-2 border-white bg-ink ring-1 ring-ink/20" /> motorista</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-accent" /> próxima parada</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-success" /> entregue</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-danger" /> não entregue</span>
          </div>
        </div>

        <aside className="flex min-h-0 flex-col border-l border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="eyebrow">Rotas ativas</h2>
            <span className="tnum text-xs text-muted">{active.length}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {routes.loading ? (
              <SkeletonRows rows={4} />
            ) : active.length === 0 ? (
              <EmptyState icon={<Radar />} title="Nenhuma rota em andamento" description="Quando uma rota for iniciada, o motorista aparece aqui e no mapa." />
            ) : (
              <ul className="divide-y divide-line">
                {active.map((r) => {
                  const driver = r.driverId ? drivers.byId.get(r.driverId) : undefined
                  const vehicle = r.vehicleId ? vehicles.byId.get(r.vehicleId) : undefined
                  const done = r.deliveredCount + r.failedCount
                  const lastAt = r.lastLocation?.recordedAt
                  const stale = !lastAt || Date.now() - lastAt.getTime() > STALE_MS
                  const openOcc = openByRoute(r.id)
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setFocusId(focusId === r.id ? null : r.id)}
                        aria-pressed={focusId === r.id}
                        className={cn(
                          'relative block w-full px-4 py-3.5 text-left transition-colors',
                          focusId === r.id ? 'bg-accent-soft/50' : 'hover:bg-sunken',
                        )}
                      >
                        {focusId === r.id && <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" />}
                        <div className="flex items-center gap-2">
                          <span className={cn('size-2 rounded-full', stale ? 'bg-warning' : 'animate-pulse-dot bg-accent')} />
                          <span className="flex-1 truncate text-[14px] font-semibold">{driver ? firstName(driver.name) : '—'}</span>
                          <Plate plate={vehicle?.plate} />
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs text-muted">
                          <span className="font-mono">Rota {r.code}</span>
                          <span className="tnum font-mono text-ink-2">
                            {done}/{r.stopCount}
                          </span>
                        </div>
                        <RouteTrack points={trackFromOrders(r, orders.items)} live className="mt-2" />
                        <div className="mt-2 flex items-center justify-between text-2xs">
                          <span className={stale ? 'font-medium text-warning' : 'text-faint'}>
                            {lastAt ? `posição ${timeAgo(lastAt)}` : 'sem posição recebida'}
                          </span>
                          {openOcc > 0 && <span className="font-semibold text-warning">{openOcc} ocorrência(s)</span>}
                        </div>
                      </button>
                      {focusId === r.id && (
                        <Link
                          to={`/rotas/${r.id}`}
                          className="flex items-center justify-end gap-1 border-t border-line bg-accent-soft/30 px-4 py-2 text-[13px] font-medium text-accent-ink hover:underline"
                        >
                          Abrir rota <ArrowRight className="size-3.5" />
                        </Link>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
