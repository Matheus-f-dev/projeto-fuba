import { IdCard, Pencil, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Page } from '@/components/layout/AppShell'
import { Badge, RouteStatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Sheet } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Field'
import { Avatar, DetailRow, EmptyState, PageHeader, Segmented } from '@/components/ui/misc'
import { Plate } from '@/components/ui/Plate'
import { SkeletonRows } from '@/components/ui/Spinner'
import { DriverFormDialog } from '@/features/drivers/DriverFormDialog'
import { RouteTrack, trackFromOrders } from '@/features/routes/RouteTrack'
import { useAction } from '@/hooks/useAction'
import { useOperationData } from '@/hooks/useOperationData'
import { RESOURCE_STATE_META, resourceState, useActiveAssignments } from '@/hooks/useSelectors'
import { useReadySession } from '@/hooks/useSession'
import { driversService } from '@/services/driversService'
import type { Driver } from '@/types/domain'
import { formatRelativeDay, timeAgo, todayISO } from '@/utils/dates'
import { formatPhone, normalizeSearch } from '@/utils/format'

type Scope = 'ACTIVE' | 'INACTIVE' | 'all'

export function DriversPage() {
  const { ctx } = useReadySession()
  const { drivers, routes, orders, vehicles } = useOperationData()
  const { byDriver } = useActiveAssignments()
  const [scope, setScope] = useState<Scope>('ACTIVE')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Driver | 'new' | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [toggling, setToggling] = useState<Driver | null>(null)
  const toggle = useAction()

  const deliveredToday = useMemo(() => {
    const today = todayISO()
    const map = new Map<string, number>()
    for (const o of orders.items)
      if (o.driverId && o.status === 'DELIVERED' && o.scheduledDate === today) map.set(o.driverId, (map.get(o.driverId) ?? 0) + 1)
    return map
  }, [orders.items])

  const list = useMemo(() => {
    const q = normalizeSearch(search)
    return drivers.items
      .filter((d) => (scope === 'all' || d.status === scope) && (!q || normalizeSearch(`${d.name} ${d.phone}`).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [drivers.items, scope, search])

  const detail = detailId ? drivers.byId.get(detailId) : undefined
  const detailRoutes = detail
    ? routes.items.filter((r) => r.driverId === detail.id).sort((a, b) => b.date.localeCompare(a.date) || b.code.localeCompare(a.code))
    : []

  return (
    <Page>
      <PageHeader
        title="Motoristas"
        description="Cadastro e situação de cada motorista na operação de hoje."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Novo motorista
          </Button>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Segmented
          label="Situação do cadastro"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'ACTIVE', label: 'Ativos', count: drivers.items.filter((d) => d.status === 'ACTIVE').length },
            { value: 'INACTIVE', label: 'Inativos', count: drivers.items.filter((d) => d.status === 'INACTIVE').length },
            { value: 'all', label: 'Todos' },
          ]}
        />
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome ou telefone" className="pl-9" aria-label="Buscar motorista" />
        </div>
      </div>

      <div className="panel overflow-hidden">
        {drivers.loading ? (
          <SkeletonRows rows={5} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<IdCard />}
            title={drivers.items.length === 0 ? 'Nenhum motorista cadastrado' : 'Nenhum motorista encontrado'}
            description={drivers.items.length === 0 ? 'Cadastre motoristas para atribuí-los às rotas.' : undefined}
            action={drivers.items.length === 0 && <Button onClick={() => setEditing('new')}>Cadastrar motorista</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Motorista</th>
                  <th className="px-4 py-2.5 font-medium">Situação</th>
                  <th className="px-4 py-2.5 font-medium">Rota atual</th>
                  <th className="px-4 py-2.5 font-medium">Entregas hoje</th>
                  <th className="px-4 py-2.5 font-medium">Última posição</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {list.map((d) => {
                  const route = byDriver.get(d.id)
                  const state = resourceState(d, route)
                  const meta = RESOURCE_STATE_META[state]
                  return (
                    <tr key={d.id} className="table-row cursor-pointer hover:bg-sunken" onClick={() => setDetailId(d.id)}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={d.name} />
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{d.name}</p>
                            <p className="tnum text-xs text-muted">{formatPhone(d.phone)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={meta.tone} pulse={state === 'on-route'}>
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        {route ? (
                          <div className="w-44">
                            <div className="flex justify-between text-xs">
                              <span className="font-mono font-medium">{route.code}</span>
                              <span className="tnum font-mono text-muted">
                                {route.deliveredCount + route.failedCount}/{route.stopCount}
                              </span>
                            </div>
                            <RouteTrack points={trackFromOrders(route, orders.items)} live={route.status === 'IN_PROGRESS'} className="mt-1.5" />
                          </div>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="tnum px-4 py-2.5 font-mono text-ink-2">{deliveredToday.get(d.id) ?? 0}</td>
                      <td className="px-4 py-2.5 text-xs text-muted">
                        {route?.status === 'IN_PROGRESS' ? timeAgo(route.lastLocation?.recordedAt) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(d)}>
                          Editar
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Sheet
        open={Boolean(detail)}
        onClose={() => setDetailId(null)}
        title={
          detail && (
            <div className="flex items-center gap-3">
              <Avatar name={detail.name} className="size-10 text-xs" />
              <div>
                <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">{detail.name}</h2>
                <Badge tone={RESOURCE_STATE_META[resourceState(detail, byDriver.get(detail.id))].tone}>
                  {RESOURCE_STATE_META[resourceState(detail, byDriver.get(detail.id))].label}
                </Badge>
              </div>
            </div>
          )
        }
        footer={
          detail && (
            <>
              <Button icon={<Pencil className="size-3.5" />} onClick={() => setEditing(detail)}>
                Editar
              </Button>
              <Button
                variant={detail.status === 'ACTIVE' ? 'quiet-danger' : 'secondary'}
                onClick={() => setToggling(detail)}
                disabled={detail.status === 'ACTIVE' && Boolean(byDriver.get(detail.id))}
                title={byDriver.get(detail.id) ? 'Motorista com rota ativa não pode ser desativado' : undefined}
                className="ml-auto"
              >
                {detail.status === 'ACTIVE' ? 'Desativar' : 'Reativar'}
              </Button>
            </>
          )
        }
      >
        {detail && (
          <div className="px-6 py-5">
            <dl>
              <DetailRow label="Telefone">
                <a href={`tel:${detail.phone}`} className="tnum hover:text-accent-ink">
                  {formatPhone(detail.phone)}
                </a>
              </DetailRow>
              <DetailRow label="CPF">{detail.document || <span className="text-faint">Não informado</span>}</DetailRow>
              <DetailRow label="CNH">
                {detail.license ? `${detail.license} · categoria ${detail.licenseCategory}` : <span className="text-faint">Não informada</span>}
              </DetailRow>
              <DetailRow label="Entregas hoje">{deliveredToday.get(detail.id) ?? 0}</DetailRow>
            </dl>
            <h3 className="eyebrow mt-6 mb-2">Rotas nos últimos 14 dias</h3>
            {detailRoutes.length === 0 ? (
              <p className="text-[13px] text-muted">Nenhuma rota no período.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {detailRoutes.map((r) => (
                  <li key={r.id}>
                    <Link to={`/rotas/${r.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-sunken">
                      <span className="font-mono text-xs font-medium">{r.code}</span>
                      <span className="text-xs text-muted">{formatRelativeDay(r.date)}</span>
                      <Plate plate={r.vehicleId ? vehicles.byId.get(r.vehicleId)?.plate : null} />
                      <span className="tnum ml-auto font-mono text-xs text-ink-2">
                        {r.deliveredCount}/{r.stopCount}
                      </span>
                      <RouteStatusBadge status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Sheet>

      <DriverFormDialog open={editing !== null} onClose={() => setEditing(null)} driver={editing && editing !== 'new' ? editing : undefined} />
      <ConfirmDialog
        open={Boolean(toggling)}
        onClose={() => setToggling(null)}
        title={toggling?.status === 'ACTIVE' ? `Desativar ${toggling?.name}?` : `Reativar ${toggling?.name}?`}
        description={
          toggling?.status === 'ACTIVE'
            ? 'O motorista deixa de aparecer para novas rotas. O histórico é mantido.'
            : 'O motorista volta a ficar disponível para novas rotas.'
        }
        confirmLabel={toggling?.status === 'ACTIVE' ? 'Desativar' : 'Reativar'}
        tone={toggling?.status === 'ACTIVE' ? 'danger' : 'primary'}
        pending={toggle.pending}
        onConfirm={async () => {
          if (!toggling) return
          const next = toggling.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
          const ok = await toggle.run(
            () => driversService.setStatus(ctx, toggling.id, next),
            next === 'ACTIVE' ? 'Motorista reativado' : 'Motorista desativado',
          )
          if (ok) setToggling(null)
        }}
      />
    </Page>
  )
}
