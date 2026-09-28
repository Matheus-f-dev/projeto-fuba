import { ArrowRight, Plus, Waypoints } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Page } from '@/components/layout/AppShell'
import { OccurrenceStatusBadge, OrderStatusBadge, RouteStatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState, SectionTitle } from '@/components/ui/misc'
import { Plate } from '@/components/ui/Plate'
import { Skeleton, SkeletonRows } from '@/components/ui/Spinner'
import { OCCURRENCE_TYPE_LABEL } from '@/domain/status'
import { OrderFormDialog } from '@/features/orders/OrderFormDialog'
import { RouteTrack, trackFromOrders } from '@/features/routes/RouteTrack'
import { useOperationData } from '@/hooks/useOperationData'
import { useOrderSheet } from '@/hooks/useSelectors'
import { useReadySession } from '@/hooks/useSession'
import { cn } from '@/utils/cn'
import { formatLongDate, formatTime, timeAgo, todayISO } from '@/utils/dates'
import { cityLine, firstName } from '@/utils/format'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

export function DashboardPage() {
  const { profile } = useReadySession()
  const { orders, routes, drivers, vehicles, occurrences } = useOperationData()
  const { open: openOrder } = useOrderSheet()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const today = todayISO()

  const stats = useMemo(() => {
    const todays = orders.items.filter((o) => o.scheduledDate === today && o.status !== 'CANCELLED')
    const count = (fn: (s: string) => boolean) => todays.filter((o) => fn(o.status)).length
    return {
      total: todays.length,
      pending: count((s) => s === 'CREATED' || s === 'PLANNED' || s === 'ASSIGNED'),
      waiting: count((s) => s === 'CREATED'),
      inTransit: count((s) => s === 'IN_TRANSIT'),
      delivered: count((s) => s === 'DELIVERED'),
      failed: count((s) => s === 'FAILED'),
    }
  }, [orders.items, today])

  const activeRoutes = useMemo(
    () =>
      routes.items
        .filter((r) => r.status === 'IN_PROGRESS' || (r.status === 'ASSIGNED' && r.date === today))
        .sort((a, b) => (a.status === b.status ? a.code.localeCompare(b.code) : a.status === 'IN_PROGRESS' ? -1 : 1)),
    [routes.items, today],
  )

  const recent = useMemo(
    () =>
      orders.items
        .filter((o) => (o.status === 'DELIVERED' || o.status === 'FAILED') && o.scheduledDate === today)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, 8),
    [orders.items, today],
  )

  const openOccurrences = useMemo(
    () =>
      occurrences.items
        .filter((o) => o.status === 'OPEN')
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [occurrences.items],
  )

  const loading = orders.loading || routes.loading

  const figures = [
    { label: 'Pedidos para hoje', value: stats.total },
    { label: 'Pendentes', value: stats.pending, hint: stats.waiting ? `${stats.waiting} sem rota` : undefined },
    { label: 'Em rota', value: stats.inTransit, tone: 'text-accent-ink' },
    { label: 'Entregues', value: stats.delivered, tone: 'text-success', hint: stats.failed ? `${stats.failed} não entregue(s)` : undefined },
  ]
  const bar = [
    { value: stats.delivered, className: 'bg-success', label: 'Entregues' },
    { value: stats.failed, className: 'bg-danger', label: 'Não entregues' },
    { value: stats.inTransit, className: 'bg-accent', label: 'Em rota' },
    { value: stats.pending, className: 'bg-line-strong', label: 'Pendentes' },
  ]

  return (
    <Page>
      <header className="flex flex-wrap items-end gap-x-6 gap-y-4 pb-6">
        <div className="min-w-[240px] flex-1">
          <p className="text-[13px] text-muted first-letter:uppercase">{formatLongDate(new Date())}</p>
          <h1 className="mt-1 font-display text-[28px] leading-8 font-semibold tracking-[-0.03em]">
            {greeting()}, {firstName(profile.name)}
          </h1>
          <p className="mt-1 text-[13px] text-muted">Resumo da operação de hoje</p>
        </div>
        <div className="flex gap-2">
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Novo pedido
          </Button>
          <Button variant="primary" icon={<Waypoints className="size-4" />} onClick={() => navigate('/planejamento')}>
            Planejar rotas
          </Button>
        </div>
      </header>

      {/* Números do dia: uma superfície só, com a composição logo abaixo */}
      <section className="panel" aria-label="Números do dia">
        <div className="grid grid-cols-2 lg:grid-cols-4">
          {figures.map((f, i) => (
            <div
              key={f.label}
              className={cn(
                'px-5 py-4',
                i % 2 === 1 && 'border-l border-line',
                i >= 2 && 'border-t border-line lg:border-t-0',
                i === 2 && 'lg:border-l',
              )}
            >
              <p className="text-[13px] text-muted">{f.label}</p>
              {loading ? (
                <Skeleton className="mt-2 h-8 w-14" />
              ) : (
                <p className={cn('tnum mt-1 font-display text-[32px] leading-9 font-semibold tracking-[-0.03em]', f.tone)}>
                  {f.value}
                </p>
              )}
              <p className="h-4 text-xs text-faint">{!loading && f.hint}</p>
            </div>
          ))}
        </div>
        {!loading && stats.total > 0 && (
          <div className="border-t border-line px-5 py-3">
            <div className="flex h-1.5 overflow-hidden rounded-full bg-ink/[0.05]" aria-hidden>
              {bar.map((b) =>
                b.value ? <div key={b.label} className={b.className} style={{ width: `${(b.value / stats.total) * 100}%` }} /> : null,
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {bar.map((b) => (
                <span key={b.label} className="inline-flex items-center gap-1.5">
                  <span className={cn('size-2 rounded-full', b.className)} />
                  {b.label}
                  <span className="tnum text-ink-2">{Math.round((b.value / stats.total) * 100)}%</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0">
          <SectionTitle
            action={
              <Link to="/rotas" className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink">
                Todas as rotas <ArrowRight className="size-3.5" />
              </Link>
            }
          >
            Rotas em andamento
          </SectionTitle>
          <div className="panel overflow-hidden">
            {routes.loading ? (
              <SkeletonRows rows={3} />
            ) : activeRoutes.length === 0 ? (
              <EmptyState
                title="Nenhuma rota na rua agora"
                description="Rotas iniciadas e prontas para sair hoje aparecem aqui."
                action={<Button onClick={() => navigate('/planejamento')}>Planejar rotas</Button>}
              />
            ) : (
              <ul className="divide-y divide-line">
                {activeRoutes.map((r) => {
                  const driver = r.driverId ? drivers.byId.get(r.driverId) : undefined
                  const vehicle = r.vehicleId ? vehicles.byId.get(r.vehicleId) : undefined
                  const done = r.deliveredCount + r.failedCount
                  return (
                    <li key={r.id}>
                      <Link
                        to={`/rotas/${r.id}`}
                        className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2.5 px-4 py-3.5 transition-colors hover:bg-sunken sm:grid-cols-[180px_1fr_auto]"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-medium text-muted">{r.code}</span>
                            <Plate plate={vehicle?.plate} />
                          </div>
                          <p className="mt-1 truncate text-[13.5px] font-semibold">{driver?.name ?? '—'}</p>
                        </div>
                        <div className="order-3 col-span-2 flex items-center gap-3 sm:order-none sm:col-span-1">
                          <RouteTrack points={trackFromOrders(r, orders.items)} live={r.status === 'IN_PROGRESS'} />
                          <span className="tnum shrink-0 font-mono text-xs text-ink-2">
                            {done}/{r.stopCount}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <RouteStatusBadge status={r.status} />
                          <span className="text-2xs text-faint">
                            {r.status === 'IN_PROGRESS'
                              ? `atualizado ${timeAgo(r.lastLocation?.recordedAt ?? r.updatedAt)}`
                              : r.plannedStartAt
                                ? `saída ${r.plannedStartAt}`
                                : 'aguardando saída'}
                          </span>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="mt-8">
            <SectionTitle>Entregas recentes de hoje</SectionTitle>
          </div>
          <div className="panel overflow-hidden">
            {orders.loading ? (
              <SkeletonRows rows={4} />
            ) : recent.length === 0 ? (
              <EmptyState title="Nenhuma entrega concluída hoje" description="Entregas e tentativas registradas aparecem aqui em tempo real." />
            ) : (
              <table className="w-full text-[13px]">
                <thead className="sr-only sm:not-sr-only">
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="px-4 py-2 font-medium">Pedido</th>
                    <th className="px-4 py-2 font-medium">Destinatário</th>
                    <th className="hidden px-4 py-2 font-medium md:table-cell">Cidade</th>
                    <th className="px-4 py-2 font-medium">Horário</th>
                    <th className="px-4 py-2 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((o) => (
                    <tr key={o.id} className="table-row cursor-pointer hover:bg-sunken" onClick={() => openOrder(o.id)}>
                      <td className="hidden px-4 py-2.5 sm:table-cell">
                        <button type="button" className="font-mono text-xs font-medium whitespace-nowrap hover:text-accent-ink" onClick={() => openOrder(o.id)}>
                          {o.number}
                        </button>
                      </td>
                      <td className="max-w-[150px] px-3 py-2.5 sm:max-w-[200px] sm:px-4">
                        <p className="truncate font-medium">{o.recipient.name}</p>
                        <p className="font-mono text-2xs text-muted sm:hidden">{o.number}</p>
                      </td>
                      <td className="hidden px-4 py-2.5 text-ink-2 md:table-cell">{cityLine({ ...o.address, district: '' })}</td>
                      <td className="tnum px-3 py-2.5 font-mono text-xs text-ink-2 sm:px-4">{formatTime(o.deliveredAt ?? o.updatedAt)}</td>
                      <td className="px-3 py-2.5 text-right sm:px-4">
                        <OrderStatusBadge status={o.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="min-w-0">
          <SectionTitle
            action={
              <Link to="/ocorrencias" className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink">
                Ver todas <ArrowRight className="size-3.5" />
              </Link>
            }
          >
            Ocorrências em aberto
          </SectionTitle>
          <div className="panel overflow-hidden">
            {occurrences.loading ? (
              <SkeletonRows rows={3} />
            ) : openOccurrences.length === 0 ? (
              <EmptyState title="Nenhuma ocorrência em aberto" description="Não entregas e problemas registrados na rua aparecem aqui." />
            ) : (
              <ul className="divide-y divide-line">
                {openOccurrences.slice(0, 6).map((occ) => {
                  const order = occ.orderId ? orders.byId.get(occ.orderId) : undefined
                  return (
                    <li key={occ.id}>
                      <button
                        type="button"
                        onClick={() => (order ? openOrder(order.id) : navigate('/ocorrencias'))}
                        className="block w-full px-4 py-3 text-left transition-colors hover:bg-sunken"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-semibold">{OCCURRENCE_TYPE_LABEL[occ.type]}</span>
                          <span className="tnum font-mono text-2xs text-faint">{formatTime(occ.createdAt)}</span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-2">{occ.description}</p>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <span className="font-mono text-2xs text-muted">{order?.number ?? 'Rota'}</span>
                          <OccurrenceStatusBadge status={occ.status} />
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {openOccurrences.length > 6 && (
              <Link to="/ocorrencias" className="block border-t border-line px-4 py-2.5 text-center text-[13px] font-medium text-muted hover:text-ink">
                Mais {openOccurrences.length - 6} em aberto
              </Link>
            )}
          </div>
        </section>
      </div>

      <OrderFormDialog open={creating} onClose={() => setCreating(false)} />
    </Page>
  )
}
