import { MapPinOff, Search, Waypoints } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { MapView, type MapMarker } from '@/components/map/MapView'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field'
import { EmptyState } from '@/components/ui/misc'
import { SkeletonRows } from '@/components/ui/Spinner'
import { PLANNABLE_ORDER_STATUSES } from '@/domain/status'
import { moveItem, SequenceEditor } from '@/features/routes/SequenceEditor'
import { useAction } from '@/hooks/useAction'
import { useOperationData } from '@/hooks/useOperationData'
import { useActiveAssignments } from '@/hooks/useSelectors'
import { useReadySession } from '@/hooks/useSession'
import { MAX_STOPS_PER_ROUTE, routesService } from '@/services/routesService'
import { cn } from '@/utils/cn'
import { addDaysISO, formatRelativeDay, todayISO } from '@/utils/dates'
import { normalizeSearch, plural } from '@/utils/format'

type DateScope = 'due' | 'tomorrow' | 'all'

export function PlanningPage() {
  const { ctx } = useReadySession()
  const { orders, drivers, vehicles } = useOperationData()
  const { byDriver, byVehicle } = useActiveAssignments()
  const navigate = useNavigate()
  const { pending, run } = useAction()

  const [scope, setScope] = useState<DateScope>('due')
  const [search, setSearch] = useState('')
  const [city, setCity] = useState('all')
  const [selected, setSelected] = useState<string[]>([])
  const [routeDate, setRouteDate] = useState(todayISO())
  const [plannedStartAt, setPlannedStartAt] = useState('')
  const [driverId, setDriverId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [notes, setNotes] = useState('')

  const available = useMemo(
    () => orders.items.filter((o) => PLANNABLE_ORDER_STATUSES.includes(o.status)),
    [orders.items],
  )
  const cities = useMemo(() => [...new Set(available.map((o) => o.address.city))].sort(), [available])

  const visible = useMemo(() => {
    const today = todayISO()
    const q = normalizeSearch(search)
    return available
      .filter((o) => {
        if (scope === 'due' && o.scheduledDate > today) return false
        if (scope === 'tomorrow' && o.scheduledDate !== addDaysISO(today, 1)) return false
        if (city !== 'all' && o.address.city !== city) return false
        if (q && !normalizeSearch(`${o.number} ${o.recipient.name} ${o.address.district} ${o.address.street}`).includes(q))
          return false
        return true
      })
      .sort((a, b) =>
        a.scheduledDate === b.scheduledDate
          ? (a.timeWindow?.start ?? '99').localeCompare(b.timeWindow?.start ?? '99') || a.number.localeCompare(b.number)
          : a.scheduledDate.localeCompare(b.scheduledDate),
      )
  }, [available, scope, search, city])

  // Pedido selecionado que deixou de estar disponível (ex.: cancelado em outra aba) sai da seleção
  const selectedOrders = selected.map((id) => orders.byId.get(id)).filter((o) => o && PLANNABLE_ORDER_STATUSES.includes(o.status))
  const selectedIds = new Set(selectedOrders.map((o) => o!.id))

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX_STOPS_PER_ROUTE ? s : [...s, id]))
  const allVisibleSelected = visible.length > 0 && visible.every((o) => selectedIds.has(o.id))
  const toggleAllVisible = () =>
    setSelected((s) =>
      allVisibleSelected
        ? s.filter((id) => !visible.some((o) => o.id === id))
        : [...s, ...visible.filter((o) => !s.includes(o.id)).map((o) => o.id)].slice(0, MAX_STOPS_PER_ROUTE),
    )

  const activeDrivers = drivers.items.filter((d) => d.status === 'ACTIVE').sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const activeVehicles = vehicles.items.filter((v) => v.status === 'ACTIVE').sort((a, b) => a.plate.localeCompare(b.plate))

  const markers = useMemo<MapMarker[]>(() => {
    const seq = new Map(selectedOrders.map((o, i) => [o!.id, i + 1]))
    return visible
      .concat(selectedOrders.filter((o) => !visible.includes(o!)) as typeof visible)
      .filter((o) => o.location)
      .map((o) => ({
        id: o.id,
        position: o.location!,
        variant: seq.has(o.id) ? 'order-selected' : 'order',
        label: seq.has(o.id) ? String(seq.get(o.id)) : undefined,
        title: `${o.number} · ${o.recipient.name}`,
        onClick: () => toggle(o.id),
      }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, selected, orders.byId])

  const plannedPath = selectedOrders.filter((o) => o!.location).map((o) => o!.location!)
  const missingLocation = selectedOrders.filter((o) => !o!.location).length
  const assigning = Boolean(driverId && vehicleId)
  const partial = Boolean(driverId) !== Boolean(vehicleId)

  const create = async () => {
    await run(async () => {
      const { id, code } = await routesService.create(ctx, {
        date: routeDate,
        orderIds: selectedOrders.map((o) => o!.id),
        driverId: driverId || null,
        vehicleId: vehicleId || null,
        plannedStartAt: plannedStartAt || null,
        notes,
      })
      toast.success(assigning ? `Rota ${code} criada e atribuída` : `Rota ${code} salva como rascunho`, {
        description: plural(selectedOrders.length, 'parada', 'paradas'),
      })
      navigate(`/rotas/${id}`)
    })
  }

  return (
    <div className="flex min-h-dvh flex-col xl:h-dvh">
      <header className="flex flex-wrap items-end gap-4 border-b border-line bg-surface px-4 py-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[22px] leading-7 font-semibold tracking-[-0.02em]">Planejamento de entregas</h1>
          <p className="mt-1 text-[13px] text-muted">
            Selecione os pedidos, defina a ordem de entrega e atribua motorista e veículo.
          </p>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 md:grid-cols-2 xl:min-h-0 xl:grid-cols-[340px_minmax(0,1fr)_360px]">
        {/* Pedidos disponíveis */}
        <section className="flex min-h-0 flex-col border-line bg-surface md:border-r xl:order-none" aria-label="Pedidos disponíveis">
          <div className="space-y-2 border-b border-line p-3">
            <div className="flex items-center justify-between">
              <h2 className="eyebrow">Pedidos disponíveis</h2>
              <span className="tnum text-xs text-muted">{available.length} sem rota</span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Número, nome ou bairro" className="pl-9" aria-label="Buscar pedidos disponíveis" />
            </div>
            <div className="flex gap-2">
              <Select value={scope} onChange={(e) => setScope(e.target.value as DateScope)} aria-label="Data prevista" className="flex-1">
                <option value="due">Hoje e atrasados</option>
                <option value="tomorrow">Amanhã</option>
                <option value="all">Todas as datas</option>
              </Select>
              <Select value={city} onChange={(e) => setCity(e.target.value)} aria-label="Cidade" className="flex-1">
                <option value="all">Todas as cidades</option>
                {cities.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </div>
          </div>
          {visible.length > 0 && (
            <label className="flex cursor-pointer items-center gap-2.5 border-b border-line px-3 py-2 text-xs text-muted hover:bg-sunken">
              <Checkbox checked={allVisibleSelected} onChange={toggleAllVisible} />
              Selecionar {plural(visible.length, 'pedido listado', 'pedidos listados')}
            </label>
          )}
          <div className="max-h-[420px] min-h-0 flex-1 overflow-y-auto xl:max-h-none">
            {orders.loading ? (
              <SkeletonRows rows={6} />
            ) : visible.length === 0 ? (
              <EmptyState
                title={available.length === 0 ? 'Todos os pedidos já estão em rotas' : 'Nenhum pedido com esses filtros'}
                description={available.length === 0 ? 'Novos pedidos aparecem aqui assim que são cadastrados.' : undefined}
              />
            ) : (
              <ul>
                {visible.map((o) => {
                  const isSelected = selectedIds.has(o.id)
                  const late = o.scheduledDate < todayISO()
                  return (
                    <li key={o.id}>
                      <label
                        className={cn(
                          'flex cursor-pointer items-start gap-2.5 border-b border-line px-3 py-2.5 transition-colors',
                          isSelected ? 'bg-accent-soft/50' : 'hover:bg-sunken',
                        )}
                      >
                        <Checkbox checked={isSelected} onChange={() => toggle(o.id)} className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-medium">{o.number}</span>
                            {!o.location && <MapPinOff className="size-3 text-faint" aria-label="Sem ponto no mapa" />}
                            <span className={cn('ml-auto text-2xs', late ? 'font-semibold text-danger' : 'text-muted')}>
                              {late ? 'Atrasado · ' : ''}
                              {formatRelativeDay(o.scheduledDate)}
                              {o.timeWindow && ` · ${o.timeWindow.start}–${o.timeWindow.end}`}
                            </span>
                          </div>
                          <p className="truncate text-[13px] font-medium">{o.recipient.name}</p>
                          <p className="truncate text-xs text-muted">
                            {o.address.district}, {o.address.city}
                          </p>
                        </div>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Mapa */}
        <section className="relative min-h-[360px] border-b border-line md:col-span-2 md:row-start-1 xl:col-span-1 xl:row-start-auto xl:border-b-0" aria-label="Mapa">
          <MapView
            className="absolute inset-0"
            markers={markers}
            paths={plannedPath.length > 1 ? [{ id: 'planned', points: plannedPath, variant: 'planned' }] : []}
            fitKey={`${scope}|${city}|${visible.length}`}
          />
          <div className="pointer-events-none absolute top-3 left-3 z-[500] flex gap-3 rounded-md bg-surface/95 px-2.5 py-1.5 text-2xs text-muted shadow-sm">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full border-2 border-slate bg-white" /> disponível
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-ink" /> na rota
            </span>
          </div>
        </section>

        {/* Montagem da rota */}
        <section className="flex min-h-0 flex-col border-line bg-surface md:border-l xl:border-l" aria-label="Nova rota">
          <div className="grid grid-cols-2 gap-3 border-b border-line p-4">
            <Field label="Data da rota">
              {(p) => <Input {...p} type="date" min={todayISO()} value={routeDate} onChange={(e) => setRouteDate(e.target.value)} />}
            </Field>
            <Field label="Saída prevista" optional>
              {(p) => <Input {...p} type="time" value={plannedStartAt} onChange={(e) => setPlannedStartAt(e.target.value)} />}
            </Field>
            <Field label="Motorista" className="col-span-2">
              {(p) => (
                <Select {...p} value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                  <option value="">Selecionar depois</option>
                  {activeDrivers.map((d) => {
                    const busy = byDriver.get(d.id)
                    return (
                      <option key={d.id} value={d.id} disabled={Boolean(busy)}>
                        {d.name}
                        {busy ? ` — na rota ${busy.code}` : ''}
                      </option>
                    )
                  })}
                </Select>
              )}
            </Field>
            <Field label="Veículo" className="col-span-2" error={partial ? 'Selecione motorista e veículo, ou nenhum dos dois.' : undefined}>
              {(p) => (
                <Select {...p} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                  <option value="">Selecionar depois</option>
                  {activeVehicles.map((v) => {
                    const busy = byVehicle.get(v.id)
                    return (
                      <option key={v.id} value={v.id} disabled={Boolean(busy)}>
                        {v.plate} · {v.model}
                        {busy ? ` — na rota ${busy.code}` : ''}
                      </option>
                    )
                  })}
                </Select>
              )}
            </Field>
          </div>

          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h2 className="eyebrow">Ordem das entregas</h2>
            {selectedOrders.length > 0 && (
              <button type="button" onClick={() => setSelected([])} className="text-xs font-medium text-muted hover:text-ink">
                Limpar
              </button>
            )}
          </div>
          <div className="min-h-[120px] flex-1 overflow-y-auto px-4 pb-4">
            {selectedOrders.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center text-[13px] text-muted">
                Marque pedidos na lista ou clique nos pontos do mapa. A ordem de seleção vira a sequência inicial.
              </div>
            ) : (
              <SequenceEditor
                items={selectedOrders.map((o) => ({
                  id: o!.id,
                  title: (
                    <>
                      <span className="font-mono text-xs text-muted">{o!.number}</span> {o!.recipient.name}
                    </>
                  ),
                  subtitle: `${o!.address.district} · ${o!.address.city}${o!.timeWindow ? ` · ${o!.timeWindow.start}–${o!.timeWindow.end}` : ''}`,
                }))}
                onMove={(from, to) => setSelected(moveItem(selectedOrders.map((o) => o!.id), from, to))}
                onRemove={(id) => setSelected((s) => s.filter((x) => x !== id))}
              />
            )}
            {selectedOrders.length > 0 && (
              <Field label="Observações da rota" optional className="mt-4">
                {(p) => <Textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}
              </Field>
            )}
          </div>

          <div className="border-t border-line bg-sunken/60 p-4">
            {missingLocation > 0 && (
              <p className="mb-2 text-xs text-warning">
                {plural(missingLocation, 'pedido selecionado está', 'pedidos selecionados estão')} sem ponto no mapa.
              </p>
            )}
            <div className="flex items-center gap-3">
              <p className="tnum flex-1 text-[13px] text-ink-2">
                <span className="font-semibold text-ink">{selectedOrders.length}</span>{' '}
                {selectedOrders.length === 1 ? 'parada' : 'paradas'}
                {selectedOrders.length >= MAX_STOPS_PER_ROUTE && <span className="text-warning"> (limite)</span>}
              </p>
              <Button
                variant="primary"
                icon={<Waypoints className="size-4" />}
                disabled={selectedOrders.length === 0 || partial}
                loading={pending}
                onClick={create}
              >
                {assigning ? 'Criar e atribuir rota' : 'Salvar rascunho'}
              </Button>
            </div>
            {!assigning && selectedOrders.length > 0 && !partial && (
              <p className="mt-2 text-xs text-muted">Sem motorista e veículo, a rota fica como rascunho até ser atribuída.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
