import {
  ArrowLeft,
  Check,
  CircleX,
  Flag,
  Image,
  ListOrdered,
  LocateFixed,
  MapPin,
  Navigation,
  Play,
  TriangleAlert,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Page } from '@/components/layout/AppShell'
import { MapView, type MapMarker } from '@/components/map/MapView'
import { RouteStatusBadge, StopStatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState, SectionTitle } from '@/components/ui/misc'
import { Plate } from '@/components/ui/Plate'
import { Skeleton, SkeletonRows } from '@/components/ui/Spinner'
import { EDITABLE_ROUTE_STATUSES, OCCURRENCE_TYPE_LABEL } from '@/domain/status'
import { HistoryTimeline } from '@/features/history/HistoryTimeline'
import { NewOccurrenceDialog } from '@/features/occurrences/OccurrenceDialogs'
import { ProofViewer } from '@/features/proofs/ProofViewer'
import { AssignDialog } from '@/features/routes/AssignDialog'
import { RouteTrack, trackFromStops } from '@/features/routes/RouteTrack'
import { moveItem, SequenceEditor } from '@/features/routes/SequenceEditor'
import { DeliverDialog, FailDialog } from '@/features/routes/StopDialogs'
import { useAction } from '@/hooks/useAction'
import { useOperationData } from '@/hooks/useOperationData'
import { useOrderSheet } from '@/hooks/useSelectors'
import { useReadySession } from '@/hooks/useSession'
import { locationService } from '@/services/locationService'
import { routesService } from '@/services/routesService'
import { stopsService } from '@/services/stopsService'
import type { GeoPoint, LocationPoint, Order, RouteStop } from '@/types/domain'
import { cn } from '@/utils/cn'
import { formatDate, formatTime, timeAgo } from '@/utils/dates'
import { addressLine, formatPhone, plural } from '@/utils/format'

type StopDialog = { kind: 'deliver' | 'fail' | 'proof'; order: Order } | null
type RouteDialog = 'assign' | 'start' | 'finish' | 'cancel' | 'occurrence' | null

function navigationUrl(order: Order) {
  const dest = order.location
    ? `${order.location.lat},${order.location.lng}`
    : encodeURIComponent(`${addressLine(order.address)}, ${order.address.city} - ${order.address.state}`)
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`
}

export function RouteDetailPage() {
  const { id = '' } = useParams()
  const { ctx } = useReadySession()
  const { routes, orders, drivers, vehicles, occurrences } = useOperationData()
  const { open: openOrder } = useOrderSheet()
  const [stops, setStops] = useState<RouteStop[] | null>(null)
  const [trail, setTrail] = useState<LocationPoint[]>([])
  const [stopDialog, setStopDialog] = useState<StopDialog>(null)
  const [routeDialog, setRouteDialog] = useState<RouteDialog>(null)
  const [editing, setEditing] = useState<string[] | null>(null)
  const [removing, setRemoving] = useState<RouteStop | null>(null)
  const action = useAction()
  const stopAction = useAction()

  const route = routes.byId.get(id)
  const driver = route?.driverId ? drivers.byId.get(route.driverId) : undefined
  const vehicle = route?.vehicleId ? vehicles.byId.get(route.vehicleId) : undefined

  useEffect(() => {
    setStops(null)
    return routesService.subscribeStops(ctx.organizationId, id, setStops, () => setStops([]))
  }, [ctx.organizationId, id])

  // Trajeto: leitura única ao abrir e quando chega uma nova posição
  const lastRecorded = route?.lastLocation?.recordedAt?.getTime()
  useEffect(() => {
    if (!route || route.status === 'DRAFT' || route.status === 'ASSIGNED') return
    let active = true
    locationService
      .getTrail(ctx.organizationId, id)
      .then((points) => active && setTrail(points))
      .catch(() => active && setTrail([]))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.organizationId, id, lastRecorded, route?.status])

  const rows = useMemo(
    () => (stops ?? []).map((stop) => ({ stop, order: orders.byId.get(stop.orderId) })),
    [stops, orders.byId],
  )
  const live = route?.status === 'IN_PROGRESS'
  const nextStop = live ? rows.find((r) => r.stop.status === 'PENDING' || r.stop.status === 'ARRIVED') : undefined
  const editable = route && EDITABLE_ROUTE_STATUSES.includes(route.status)
  const routeOccurrences = occurrences.items.filter((o) => o.routeId === id && o.status === 'OPEN')

  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = rows
      .filter((r) => r.order?.location)
      .map(({ stop, order }) => ({
        id: stop.id,
        position: order!.location!,
        label: String(stop.sequence),
        title: `${stop.sequence} · ${order!.recipient.name}`,
        variant:
          stop.status === 'DELIVERED'
            ? 'stop-delivered'
            : stop.status === 'FAILED'
              ? 'stop-failed'
              : nextStop?.stop.id === stop.id
                ? 'stop-next'
                : 'stop-pending',
        onClick: () => openOrder(order!.id),
      }))
    if (route?.lastLocation && live)
      list.push({ id: 'driver', position: route.lastLocation, variant: 'driver', title: `${driver?.name ?? 'Motorista'} · ${timeAgo(route.lastLocation.recordedAt)}` })
    return list
  }, [rows, nextStop, route?.lastLocation, live, driver?.name, openOrder])

  const plannedPath = rows.filter((r) => r.order?.location).map((r) => r.order!.location!)

  if (!route) {
    return (
      <Page>
        {routes.loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <EmptyState
            title="Rota não encontrada"
            description="Ela pode ser de mais de 14 dias atrás ou ter sido removida."
            action={
              <Link to="/rotas" className="text-[13px] font-medium text-accent-ink hover:underline">
                Voltar para rotas
              </Link>
            }
          />
        )}
      </Page>
    )
  }

  const done = route.deliveredCount + route.failedCount
  const pendingCount = route.stopCount - done

  /** Somente em desenvolvimento: gera uma posição a caminho da próxima parada. */
  const simulatePosition = async () => {
    const target = nextStop?.order?.location ?? plannedPath[plannedPath.length - 1]
    if (!target) return
    const from: GeoPoint = route.lastLocation ?? { lat: target.lat - 0.02, lng: target.lng - 0.02 }
    const step = (a: number, b: number) => a + (b - a) * 0.45 + (Math.random() - 0.5) * 0.0015
    await action.run(async () => {
      const recorded = await locationService.record(ctx, route.id, {
        lat: step(from.lat, target.lat),
        lng: step(from.lng, target.lng),
        accuracy: 12,
      })
      if (!recorded) throw new Error('Aguarde 15 segundos entre posições.')
    }, 'Posição registrada')
  }

  return (
    <Page className="max-w-[1440px]">
      <Link to="/rotas" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-3.5" /> Rotas
      </Link>

      {/* Cabeçalho */}
      <header className="panel p-5">
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-[26px] leading-8 font-semibold tracking-[-0.03em]">Rota {route.code}</h1>
              <RouteStatusBadge status={route.status} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-ink-2">
              <span className="inline-flex items-center gap-1.5">
                <UserRound className="size-3.5 text-muted" />
                {driver ? (
                  <>
                    <span className="font-medium text-ink">{driver.name}</span>
                    <a href={`tel:${driver.phone}`} className="tnum text-muted hover:text-ink">
                      {formatPhone(driver.phone)}
                    </a>
                  </>
                ) : (
                  <span className="text-faint">Sem motorista</span>
                )}
              </span>
              {vehicle && (
                <span className="inline-flex items-center gap-2">
                  <Plate plate={vehicle.plate} />
                  {vehicle.model}
                </span>
              )}
              <span>
                {formatDate(route.date)}
                {route.startedAt
                  ? ` · saiu ${formatTime(route.startedAt)}`
                  : route.plannedStartAt
                    ? ` · saída prevista ${route.plannedStartAt}`
                    : ''}
                {route.finishedAt && ` · ${route.status === 'CANCELLED' ? 'cancelada' : 'finalizada'} ${formatTime(route.finishedAt)}`}
              </span>
            </div>
            {route.notes && <p className="mt-2 text-[13px] text-muted">{route.notes}</p>}
          </div>

          <div className="flex flex-wrap gap-2">
            {route.status === 'DRAFT' && (
              <Button variant="primary" onClick={() => setRouteDialog('assign')}>
                Atribuir motorista e veículo
              </Button>
            )}
            {route.status === 'ASSIGNED' && (
              <>
                <Button variant="primary" icon={<Play className="size-4" />} onClick={() => setRouteDialog('start')}>
                  Iniciar rota
                </Button>
                <Button onClick={() => setRouteDialog('assign')}>Trocar motorista/veículo</Button>
              </>
            )}
            {route.status === 'IN_PROGRESS' && (
              <>
                <Button
                  variant={pendingCount === 0 ? 'primary' : 'secondary'}
                  icon={<Flag className="size-4" />}
                  onClick={() => setRouteDialog('finish')}
                  disabled={pendingCount > 0}
                  title={pendingCount > 0 ? 'Registre o resultado de todas as paradas para finalizar' : undefined}
                >
                  Finalizar rota
                </Button>
                <Button icon={<TriangleAlert className="size-4" />} onClick={() => setRouteDialog('occurrence')}>
                  Ocorrência
                </Button>
                {import.meta.env.DEV && (
                  <Button variant="ghost" icon={<LocateFixed className="size-4" />} onClick={simulatePosition} loading={action.pending}>
                    Simular posição
                  </Button>
                )}
              </>
            )}
            {editable && (
              <Button variant="quiet-danger" onClick={() => setRouteDialog('cancel')}>
                Cancelar rota
              </Button>
            )}
          </div>
        </div>

        {/* Progresso */}
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[13px]">
              <span className="tnum font-display text-lg font-semibold">{done}</span>
              <span className="text-muted"> de {plural(route.stopCount, 'parada concluída', 'paradas concluídas')}</span>
            </p>
            <p className="tnum flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span><span className="font-semibold text-success">{route.deliveredCount}</span> entregues</span>
              <span><span className="font-semibold text-danger">{route.failedCount}</span> não entregues</span>
              <span><span className="font-semibold text-ink-2">{pendingCount}</span> pendentes</span>
              {live && route.lastLocation && <span>posição {timeAgo(route.lastLocation.recordedAt)}</span>}
            </p>
          </div>
          <RouteTrack points={trackFromStops(stops ?? [], orders.byId)} live={live} size="lg" className="mt-3" />
        </div>
      </header>

      {routeOccurrences.length > 0 && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-[13px]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">{plural(routeOccurrences.length, 'ocorrência em aberto', 'ocorrências em aberto')}</p>
            <p className="text-ink-2">
              {routeOccurrences.map((o) => `${OCCURRENCE_TYPE_LABEL[o.type]}: ${o.description}`).join(' · ')}
            </p>
          </div>
          <Link to="/ocorrencias" className="shrink-0 font-medium text-ink hover:underline">
            Tratar
          </Link>
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* Paradas */}
        <section>
          <SectionTitle
            action={
              editable &&
              stops &&
              stops.length > 1 &&
              (editing ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Descartar
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    loading={action.pending}
                    onClick={async () => {
                      const ok = await action.run(() => routesService.reorder(ctx, route.id, editing), 'Sequência salva')
                      if (ok) setEditing(null)
                    }}
                  >
                    Salvar sequência
                  </Button>
                </div>
              ) : (
                <Button size="sm" icon={<ListOrdered className="size-3.5" />} onClick={() => setEditing(stops.map((s) => s.id))}>
                  Alterar sequência
                </Button>
              ))
            }
          >
            Paradas
          </SectionTitle>

          {editing ? (
            <SequenceEditor
              items={editing.map((sid) => {
                const row = rows.find((r) => r.stop.id === sid)!
                return {
                  id: sid,
                  title: row.order?.recipient.name ?? '—',
                  subtitle: row.order ? `${addressLine(row.order.address)} · ${row.order.address.district}` : undefined,
                }
              })}
              onMove={(from, to) => setEditing(moveItem(editing, from, to))}
            />
          ) : (
            <div className="panel overflow-hidden">
              {!stops ? (
                <SkeletonRows rows={5} />
              ) : (
                <ol className="divide-y divide-line">
                  {rows.map(({ stop, order }) => {
                    const isNext = nextStop?.stop.id === stop.id
                    return (
                      <li key={stop.id} className={cn('relative px-4 py-3.5', isNext && 'bg-accent-soft/40')}>
                        {isNext && <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" />}
                        <div className="flex items-start gap-3">
                          <span
                            className={cn(
                              'tnum mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-medium',
                              stop.status === 'DELIVERED' && 'bg-success text-white',
                              stop.status === 'FAILED' && 'bg-danger text-white',
                              stop.status === 'ARRIVED' && 'bg-accent text-white',
                              stop.status === 'PENDING' && (isNext ? 'border-[1.5px] border-accent bg-surface text-accent-ink' : 'border-[1.5px] border-line-strong text-ink-2'),
                            )}
                            aria-label={`Parada ${stop.sequence}`}
                          >
                            {stop.status === 'DELIVERED' ? <Check className="size-3.5" strokeWidth={3} /> : stop.status === 'FAILED' ? <CircleX className="size-3.5" strokeWidth={2.5} /> : String(stop.sequence).padStart(2, '0')}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <button
                                type="button"
                                onClick={() => order && openOrder(order.id)}
                                className="truncate text-left text-[14px] font-semibold hover:text-accent-ink"
                              >
                                {order?.recipient.name ?? 'Pedido indisponível'}
                              </button>
                              <span className="font-mono text-2xs text-muted">{order?.number}</span>
                              {isNext && <span className="text-2xs font-semibold tracking-wide text-accent-ink uppercase">Próxima</span>}
                            </div>
                            {order && (
                              <p className="mt-0.5 text-[13px] text-ink-2">
                                {addressLine(order.address)} · {order.address.district}, {order.address.city}
                                {!order.location && <MapPin className="ml-1 inline size-3 text-faint" aria-label="sem ponto no mapa" />}
                              </p>
                            )}
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                              {order?.timeWindow && (
                                <span className="tnum font-mono">
                                  janela {order.timeWindow.start}–{order.timeWindow.end}
                                </span>
                              )}
                              {stop.arrivedAt && <span className="tnum">chegou {formatTime(stop.arrivedAt)}</span>}
                              {stop.completedAt && (
                                <span className="tnum">
                                  {stop.status === 'DELIVERED' ? 'entregue' : 'encerrada'} {formatTime(stop.completedAt)}
                                </span>
                              )}
                              {stop.failureReason && <span className="font-medium text-danger">{OCCURRENCE_TYPE_LABEL[stop.failureReason]}</span>}
                              {order?.proof && <span>recebido por {order.proof.recipientName}</span>}
                            </div>
                          </div>
                          <div className="hidden shrink-0 sm:block">
                            <StopStatusBadge status={stop.status} />
                          </div>
                        </div>

                        {/* Ações da parada */}
                        {order && (live || editable || stop.status === 'DELIVERED') && (
                          <div className="mt-2.5 flex flex-wrap gap-2 pl-10">
                            {live && (stop.status === 'PENDING' || stop.status === 'ARRIVED') && (
                              <>
                                {stop.status === 'PENDING' && (
                                  <Button
                                    size="sm"
                                    loading={stopAction.pending}
                                    onClick={() => stopAction.run(() => stopsService.arrive(ctx, stop.id), `Chegada registrada · parada ${stop.sequence}`)}
                                  >
                                    Cheguei
                                  </Button>
                                )}
                                <Button size="sm" variant="primary" icon={<Check className="size-3.5" />} onClick={() => setStopDialog({ kind: 'deliver', order })}>
                                  Entregue
                                </Button>
                                <Button size="sm" icon={<CircleX className="size-3.5" />} onClick={() => setStopDialog({ kind: 'fail', order })}>
                                  Não entregue
                                </Button>
                                <a
                                  href={navigationUrl(order)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"
                                >
                                  <Navigation className="size-3.5" />
                                  Navegar
                                </a>
                              </>
                            )}
                            {stop.status === 'DELIVERED' && order.proof && (
                              <Button size="sm" variant="ghost" icon={<Image className="size-3.5" />} onClick={() => setStopDialog({ kind: 'proof', order })}>
                                Comprovante
                              </Button>
                            )}
                            {editable && (
                              <Button size="sm" variant="ghost" className="text-muted" onClick={() => setRemoving(stop)}>
                                Remover da rota
                              </Button>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          )}
        </section>

        {/* Mapa e histórico */}
        <aside className="space-y-6">
          <div className="panel overflow-hidden">
            <MapView
              className="h-[340px]"
              markers={markers}
              paths={[
                ...(plannedPath.length > 1 ? [{ id: 'plan', points: plannedPath, variant: 'planned' as const }] : []),
                ...(trail.length > 1 ? [{ id: 'trail', points: trail, variant: 'trail' as const }] : []),
              ]}
              fitKey={`${id}|${rows.length}`}
            />
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-2xs text-muted">
              <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-ink/50" /> sequência planejada</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-[3px] border-accent/80" /> trajeto do motorista</span>
            </div>
          </div>
          <section>
            <SectionTitle>Histórico da rota</SectionTitle>
            <div className="panel max-h-[520px] overflow-y-auto p-4">
              <HistoryTimeline scope={{ routeId: route.id }} />
            </div>
          </section>
        </aside>
      </div>

      {/* Diálogos */}
      <AssignDialog route={route} open={routeDialog === 'assign'} onClose={() => setRouteDialog(null)} />
      <NewOccurrenceDialog
        open={routeDialog === 'occurrence'}
        onClose={() => setRouteDialog(null)}
        routeId={route.id}
        driverId={route.driverId}
        orderId={nextStop?.order?.id ?? null}
        defaultType="VEICULO_PROBLEMA"
        subtitle={`Rota ${route.code}${nextStop?.order ? ` · próxima parada: ${nextStop.order.recipient.name}` : ''}`}
      />
      <ConfirmDialog
        open={routeDialog === 'start'}
        onClose={() => setRouteDialog(null)}
        title={`Iniciar rota ${route.code}?`}
        description={`${plural(route.stopCount, 'pedido passa', 'pedidos passam')} para "Em rota" e o horário de saída é registrado.`}
        confirmLabel="Iniciar rota"
        pending={action.pending}
        onConfirm={async () => {
          const ok = await action.run(() => routesService.start(ctx, route.id), `Rota ${route.code} iniciada`)
          if (ok) setRouteDialog(null)
        }}
      />
      <ConfirmDialog
        open={routeDialog === 'finish'}
        onClose={() => setRouteDialog(null)}
        title={`Finalizar rota ${route.code}?`}
        description={`${route.deliveredCount} entregue(s) e ${route.failedCount} não entregue(s). Pedidos não entregues ficam disponíveis para reagendamento.`}
        confirmLabel="Finalizar rota"
        pending={action.pending}
        onConfirm={async () => {
          const ok = await action.run(() => routesService.finish(ctx, route.id), `Rota ${route.code} finalizada`)
          if (ok) setRouteDialog(null)
        }}
      />
      <ConfirmDialog
        open={routeDialog === 'cancel'}
        onClose={() => setRouteDialog(null)}
        title={`Cancelar rota ${route.code}?`}
        description="Os pedidos voltam para a fila de planejamento."
        confirmLabel="Cancelar rota"
        tone="danger"
        reasonLabel="Motivo do cancelamento"
        pending={action.pending}
        onConfirm={async (reason) => {
          const ok = await action.run(() => routesService.cancel(ctx, route.id, reason), `Rota ${route.code} cancelada`)
          if (ok) setRouteDialog(null)
        }}
      />
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remover parada da rota?"
        description={`${orders.byId.get(removing?.orderId ?? '')?.recipient.name ?? 'O pedido'} volta para a fila de planejamento.`}
        confirmLabel="Remover parada"
        tone="danger"
        pending={action.pending}
        onConfirm={async () => {
          if (!removing) return
          const ok = await action.run(() => routesService.removeStop(ctx, route.id, removing.id), 'Parada removida')
          if (ok) setRemoving(null)
        }}
      />
      {stopDialog && (
        <>
          <DeliverDialog order={stopDialog.order} open={stopDialog.kind === 'deliver'} onClose={() => setStopDialog(null)} />
          <FailDialog order={stopDialog.order} open={stopDialog.kind === 'fail'} onClose={() => setStopDialog(null)} />
          {stopDialog.order.proof && (
            <ProofViewer order={stopDialog.order} open={stopDialog.kind === 'proof'} onClose={() => setStopDialog(null)} />
          )}
        </>
      )}
    </Page>
  )
}
