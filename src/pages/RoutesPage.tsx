import { Route as RouteIcon, Waypoints } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Page } from '@/components/layout/AppShell'
import { RouteStatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState, PageHeader, Segmented } from '@/components/ui/misc'
import { Plate } from '@/components/ui/Plate'
import { SkeletonRows } from '@/components/ui/Spinner'
import { RouteTrack, trackFromOrders } from '@/features/routes/RouteTrack'
import { useOperationData } from '@/hooks/useOperationData'
import type { Route } from '@/types/domain'
import { addDaysISO, formatRelativeDay, formatTime, todayISO } from '@/utils/dates'

type DateScope = 'today' | 'yesterday' | 'week' | 'all'
type StatusScope = 'active' | 'COMPLETED' | 'CANCELLED' | 'all'

const statusRank: Record<Route['status'], number> = { IN_PROGRESS: 0, ASSIGNED: 1, DRAFT: 2, COMPLETED: 3, CANCELLED: 4 }

export function RoutesPage() {
  const { routes, orders, drivers, vehicles } = useOperationData()
  const navigate = useNavigate()
  const [date, setDate] = useState<DateScope>('today')
  const [status, setStatus] = useState<StatusScope>('all')

  const byDate = useMemo(() => {
    const today = todayISO()
    return routes.items.filter((r) => {
      // Rotas ainda ativas de dias anteriores continuam aparecendo em "Hoje"
      const activeCarryOver = date === 'today' && r.date < today && ['DRAFT', 'ASSIGNED', 'IN_PROGRESS'].includes(r.status)
      if (date === 'today') return r.date === today || activeCarryOver
      if (date === 'yesterday') return r.date === addDaysISO(today, -1)
      if (date === 'week') return r.date >= addDaysISO(today, -6)
      return true
    })
  }, [routes.items, date])

  const list = useMemo(
    () =>
      byDate
        .filter((r) =>
          status === 'all' ? true : status === 'active' ? ['DRAFT', 'ASSIGNED', 'IN_PROGRESS'].includes(r.status) : r.status === status,
        )
        .sort((a, b) => b.date.localeCompare(a.date) || statusRank[a.status] - statusRank[b.status] || b.code.localeCompare(a.code)),
    [byDate, status],
  )

  const count = (fn: (r: Route) => boolean) => byDate.filter(fn).length

  return (
    <Page>
      <PageHeader
        title="Rotas"
        description="Acompanhe a execução de cada rota e o progresso das paradas."
        actions={
          <Button variant="primary" icon={<Waypoints className="size-4" />} onClick={() => navigate('/planejamento')}>
            Nova rota
          </Button>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Segmented
          label="Período"
          value={date}
          onChange={setDate}
          options={[
            { value: 'today', label: 'Hoje' },
            { value: 'yesterday', label: 'Ontem' },
            { value: 'week', label: '7 dias' },
            { value: 'all', label: '14 dias' },
          ]}
        />
        <Segmented
          label="Situação"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'Todas', count: byDate.length },
            { value: 'active', label: 'Ativas', count: count((r) => ['DRAFT', 'ASSIGNED', 'IN_PROGRESS'].includes(r.status)) },
            { value: 'COMPLETED', label: 'Concluídas', count: count((r) => r.status === 'COMPLETED') },
            { value: 'CANCELLED', label: 'Canceladas', count: count((r) => r.status === 'CANCELLED') },
          ]}
        />
      </div>

      <div className="panel overflow-hidden">
        {routes.loading ? (
          <SkeletonRows rows={5} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<RouteIcon />}
            title="Nenhuma rota neste período"
            description="Crie rotas no planejamento a partir dos pedidos disponíveis."
            action={<Button onClick={() => navigate('/planejamento')}>Abrir planejamento</Button>}
          />
        ) : (
          <ul className="divide-y divide-line">
            <li className="hidden grid-cols-[150px_220px_minmax(0,1fr)_120px_140px] gap-4 px-4 py-2 text-xs font-medium text-muted lg:grid">
              <span>Rota</span>
              <span>Motorista e veículo</span>
              <span>Paradas</span>
              <span>Horários</span>
              <span className="text-right">Status</span>
            </li>
            {list.map((r) => {
              const driver = r.driverId ? drivers.byId.get(r.driverId) : undefined
              const vehicle = r.vehicleId ? vehicles.byId.get(r.vehicleId) : undefined
              const done = r.deliveredCount + r.failedCount
              return (
                <li key={r.id}>
                  <Link
                    to={`/rotas/${r.id}`}
                    className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 px-4 py-3.5 transition-colors hover:bg-sunken lg:grid-cols-[150px_220px_minmax(0,1fr)_120px_140px]"
                  >
                    <div>
                      <p className="font-display text-[15px] font-semibold tracking-[-0.01em]">{r.code}</p>
                      <p className="text-xs text-muted">{formatRelativeDay(r.date)}</p>
                    </div>
                    <div className="order-first col-span-2 min-w-0 lg:order-none lg:col-span-1">
                      {driver ? (
                        <>
                          <p className="truncate text-[13.5px] font-medium">{driver.name}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <Plate plate={vehicle?.plate} />
                            <span className="truncate text-xs text-muted">{vehicle?.model}</span>
                          </div>
                        </>
                      ) : (
                        <p className="text-[13px] text-faint">Sem motorista atribuído</p>
                      )}
                    </div>
                    <div className="col-span-2 flex items-center gap-3 lg:col-span-1">
                      <RouteTrack points={trackFromOrders(r, orders.items)} live={r.status === 'IN_PROGRESS'} />
                      <span className="tnum shrink-0 text-right font-mono text-xs text-ink-2">
                        {done}/{r.stopCount}
                      </span>
                    </div>
                    <div className="tnum text-xs text-muted">
                      {r.startedAt ? (
                        <>
                          <p>
                            Saída <span className="font-mono text-ink-2">{formatTime(r.startedAt)}</span>
                          </p>
                          <p>
                            Fim <span className="font-mono text-ink-2">{r.finishedAt ? formatTime(r.finishedAt) : '—'}</span>
                          </p>
                        </>
                      ) : (
                        <p>{r.plannedStartAt ? `Prevista ${r.plannedStartAt}` : 'Não iniciada'}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <RouteStatusBadge status={r.status} />
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Page>
  )
}
