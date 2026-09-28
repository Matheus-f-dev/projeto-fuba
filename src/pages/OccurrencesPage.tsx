import { TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Page } from '@/components/layout/AppShell'
import { OccurrenceStatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { EmptyState, PageHeader, Segmented } from '@/components/ui/misc'
import { SkeletonRows } from '@/components/ui/Spinner'
import { OCCURRENCE_TYPE_LABEL } from '@/domain/status'
import { ResolveOccurrenceDialog } from '@/features/occurrences/OccurrenceDialogs'
import { useOperationData } from '@/hooks/useOperationData'
import { useOrderSheet } from '@/hooks/useSelectors'
import type { Occurrence, OccurrenceType } from '@/types/domain'
import { formatDateTime } from '@/utils/dates'

type StatusScope = 'OPEN' | 'RESOLVED' | 'all'

export function OccurrencesPage() {
  const { occurrences, orders, routes, drivers } = useOperationData()
  const { open: openOrder } = useOrderSheet()
  const [status, setStatus] = useState<StatusScope>('OPEN')
  const [type, setType] = useState<'all' | OccurrenceType>('all')
  const [resolving, setResolving] = useState<Occurrence | null>(null)

  const list = useMemo(
    () =>
      occurrences.items
        .filter((o) => (status === 'all' || o.status === status) && (type === 'all' || o.type === type))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [occurrences.items, status, type],
  )
  const openCount = occurrences.items.filter((o) => o.status === 'OPEN').length

  return (
    <Page>
      <PageHeader title="Ocorrências" description="Não entregas e problemas registrados durante as rotas. Resolva para manter o histórico completo." />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Segmented
          label="Situação"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'OPEN', label: 'Em aberto', count: openCount },
            { value: 'RESOLVED', label: 'Resolvidas' },
            { value: 'all', label: 'Todas' },
          ]}
        />
        <Select value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="Tipo" className="w-[220px]">
          <option value="all">Todos os tipos</option>
          {(Object.keys(OCCURRENCE_TYPE_LABEL) as OccurrenceType[]).map((t) => (
            <option key={t} value={t}>
              {OCCURRENCE_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
      </div>

      <div className="panel overflow-hidden">
        {occurrences.loading ? (
          <SkeletonRows rows={5} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<TriangleAlert />}
            title={status === 'OPEN' ? 'Nenhuma ocorrência em aberto' : 'Nenhuma ocorrência encontrada'}
            description="Ocorrências dos últimos 30 dias aparecem aqui."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Ocorrência</th>
                  <th className="px-4 py-2.5 font-medium">Pedido</th>
                  <th className="px-4 py-2.5 font-medium">Rota e motorista</th>
                  <th className="px-4 py-2.5 font-medium">Registrada</th>
                  <th className="px-4 py-2.5 font-medium">Situação</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {list.map((occ) => {
                  const order = occ.orderId ? orders.byId.get(occ.orderId) : undefined
                  const route = occ.routeId ? routes.byId.get(occ.routeId) : undefined
                  const driver = occ.driverId ? drivers.byId.get(occ.driverId) : undefined
                  return (
                    <tr key={occ.id} className="table-row align-top">
                      <td className="max-w-[340px] px-4 py-3">
                        <p className="font-semibold">{OCCURRENCE_TYPE_LABEL[occ.type]}</p>
                        <p className="mt-0.5 text-ink-2">{occ.description}</p>
                        {occ.resolution && (
                          <p className="mt-1.5 text-xs text-muted">
                            Tratativa: {occ.resolution} · {occ.resolvedBy?.name}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {order ? (
                          <button type="button" onClick={() => openOrder(order.id)} className="text-left hover:text-accent-ink">
                            <span className="block font-mono text-xs font-medium">{order.number}</span>
                            <span className="text-xs text-muted">{order.recipient.name}</span>
                          </button>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {route ? (
                          <Link to={`/rotas/${route.id}`} className="font-mono text-xs font-medium hover:text-accent-ink">
                            {route.code}
                          </Link>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                        {driver && <p className="text-xs text-muted">{driver.name}</p>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="tnum text-ink-2">{formatDateTime(occ.createdAt)}</p>
                        <p className="text-xs text-muted">{occ.createdBy.name}</p>
                      </td>
                      <td className="px-4 py-3">
                        <OccurrenceStatusBadge status={occ.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {occ.status === 'OPEN' && (
                          <Button size="sm" onClick={() => setResolving(occ)}>
                            Resolver
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ResolveOccurrenceDialog occurrence={resolving} onClose={() => setResolving(null)} />
    </Page>
  )
}
