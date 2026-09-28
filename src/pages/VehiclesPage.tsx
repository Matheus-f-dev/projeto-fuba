import { Pencil, Plus, Truck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Page } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState, PageHeader, Segmented } from '@/components/ui/misc'
import { Plate } from '@/components/ui/Plate'
import { SkeletonRows } from '@/components/ui/Spinner'
import { VEHICLE_TYPE_LABEL } from '@/domain/status'
import { VehicleFormDialog } from '@/features/vehicles/VehicleFormDialog'
import { useAction } from '@/hooks/useAction'
import { useOperationData } from '@/hooks/useOperationData'
import { RESOURCE_STATE_META, resourceState, useActiveAssignments } from '@/hooks/useSelectors'
import { useReadySession } from '@/hooks/useSession'
import { vehiclesService } from '@/services/vehiclesService'
import type { Vehicle } from '@/types/domain'

type Scope = 'ACTIVE' | 'INACTIVE' | 'all'

export function VehiclesPage() {
  const { ctx } = useReadySession()
  const { vehicles, drivers } = useOperationData()
  const { byVehicle } = useActiveAssignments()
  const [scope, setScope] = useState<Scope>('ACTIVE')
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null)
  const [toggling, setToggling] = useState<Vehicle | null>(null)
  const toggle = useAction()

  const list = useMemo(
    () => vehicles.items.filter((v) => scope === 'all' || v.status === scope).sort((a, b) => a.plate.localeCompare(b.plate)),
    [vehicles.items, scope],
  )

  return (
    <Page>
      <PageHeader
        title="Veículos"
        description="Frota disponível para as rotas."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Novo veículo
          </Button>
        }
      />
      <Segmented
        label="Situação do cadastro"
        value={scope}
        onChange={setScope}
        className="mb-3"
        options={[
          { value: 'ACTIVE', label: 'Ativos', count: vehicles.items.filter((v) => v.status === 'ACTIVE').length },
          { value: 'INACTIVE', label: 'Inativos', count: vehicles.items.filter((v) => v.status === 'INACTIVE').length },
          { value: 'all', label: 'Todos' },
        ]}
      />

      <div className="panel overflow-hidden">
        {vehicles.loading ? (
          <SkeletonRows rows={5} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Truck />}
            title={vehicles.items.length === 0 ? 'Nenhum veículo cadastrado' : 'Nenhum veículo nesta situação'}
            action={vehicles.items.length === 0 && <Button onClick={() => setEditing('new')}>Cadastrar veículo</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Placa</th>
                  <th className="px-4 py-2.5 font-medium">Modelo e tipo</th>
                  <th className="px-4 py-2.5 font-medium">Capacidade</th>
                  <th className="px-4 py-2.5 font-medium">Situação</th>
                  <th className="px-4 py-2.5 font-medium">Motorista atual</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {list.map((v) => {
                  const route = byVehicle.get(v.id)
                  const driver = route?.driverId ? drivers.byId.get(route.driverId) : undefined
                  const state = resourceState(v, route)
                  const meta = RESOURCE_STATE_META[state]
                  return (
                    <tr key={v.id} className="table-row">
                      <td className="px-4 py-3">
                        <Plate plate={v.plate} />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{v.model}</p>
                        <p className="text-xs text-muted">{VEHICLE_TYPE_LABEL[v.type]}</p>
                      </td>
                      <td className="tnum px-4 py-3 text-ink-2">
                        {[v.capacityKg && `${v.capacityKg.toLocaleString('pt-BR')} kg`, v.capacityVolumes && `${v.capacityVolumes} vol.`]
                          .filter(Boolean)
                          .join(' · ') || <span className="text-faint">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={meta.tone} pulse={state === 'on-route'}>
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {route ? (
                          <Link to={`/rotas/${route.id}`} className="hover:text-accent-ink">
                            <span className="font-medium">{driver?.name ?? '—'}</span>
                            <span className="ml-1.5 font-mono text-xs text-muted">{route.code}</span>
                          </Link>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(v)}>
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={v.status === 'ACTIVE' && Boolean(route)}
                          title={route ? 'Veículo com rota ativa não pode ser desativado' : undefined}
                          onClick={() => setToggling(v)}
                        >
                          {v.status === 'ACTIVE' ? 'Desativar' : 'Reativar'}
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

      <VehicleFormDialog open={editing !== null} onClose={() => setEditing(null)} vehicle={editing && editing !== 'new' ? editing : undefined} />
      <ConfirmDialog
        open={Boolean(toggling)}
        onClose={() => setToggling(null)}
        title={toggling?.status === 'ACTIVE' ? `Desativar ${toggling?.plate}?` : `Reativar ${toggling?.plate}?`}
        description={
          toggling?.status === 'ACTIVE'
            ? 'O veículo deixa de aparecer para novas rotas. O histórico é mantido.'
            : 'O veículo volta a ficar disponível para novas rotas.'
        }
        confirmLabel={toggling?.status === 'ACTIVE' ? 'Desativar' : 'Reativar'}
        tone={toggling?.status === 'ACTIVE' ? 'danger' : 'primary'}
        pending={toggle.pending}
        onConfirm={async () => {
          if (!toggling) return
          const next = toggling.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
          const ok = await toggle.run(
            () => vehiclesService.setStatus(ctx, toggling.id, next),
            next === 'ACTIVE' ? 'Veículo reativado' : 'Veículo desativado',
          )
          if (ok) setToggling(null)
        }}
      />
    </Page>
  )
}
