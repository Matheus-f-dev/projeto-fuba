import { ArrowDown, ArrowUp, Package, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Page } from '@/components/layout/AppShell'
import { OrderStatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { EmptyState, PageHeader } from '@/components/ui/misc'
import { SkeletonRows } from '@/components/ui/Spinner'
import { ORDER_STATUS_META, OPEN_ORDER_STATUSES } from '@/domain/status'
import { OrderFormDialog } from '@/features/orders/OrderFormDialog'
import { useOperationData } from '@/hooks/useOperationData'
import { useOrderSheet } from '@/hooks/useSelectors'
import type { Order, OrderStatus } from '@/types/domain'
import { cn } from '@/utils/cn'
import { addDaysISO, formatRelativeDay, todayISO } from '@/utils/dates'
import { firstName, formatPhone, normalizeSearch, plural } from '@/utils/format'

type DateFilter = 'today' | 'tomorrow' | 'week' | 'all'
type StatusFilter = 'all' | 'open' | OrderStatus
type SortKey = 'number' | 'recipient' | 'city' | 'date' | 'status'

const PAGE_SIZE = 25
const STATUS_ORDER: OrderStatus[] = ['CREATED', 'PLANNED', 'ASSIGNED', 'IN_TRANSIT', 'FAILED', 'DELIVERED', 'CANCELLED']

export function OrdersPage() {
  const { orders, drivers, routes } = useOperationData()
  const { open: openOrder } = useOrderSheet()
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [date, setDate] = useState<DateFilter>('all')
  const [driverId, setDriverId] = useState('all')
  const [city, setCity] = useState('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'number', dir: -1 })
  const [page, setPage] = useState(0)

  const cities = useMemo(
    () => [...new Set(orders.items.map((o) => o.address.city))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [orders.items],
  )

  const filtered = useMemo(() => {
    const today = todayISO()
    const q = normalizeSearch(search)
    const list = orders.items.filter((o) => {
      if (status === 'open' ? !OPEN_ORDER_STATUSES.includes(o.status) : status !== 'all' && o.status !== status) return false
      if (date === 'today' && o.scheduledDate !== today) return false
      if (date === 'tomorrow' && o.scheduledDate !== addDaysISO(today, 1)) return false
      if (date === 'week' && (o.scheduledDate < addDaysISO(today, -6) || o.scheduledDate > today)) return false
      if (driverId === 'none' ? o.driverId : driverId !== 'all' && o.driverId !== driverId) return false
      if (city !== 'all' && o.address.city !== city) return false
      if (q) {
        const haystack = normalizeSearch(
          [o.number, o.reference, o.recipient.name, o.recipient.phone, o.address.street, o.address.district, o.address.city].join(' '),
        )
        if (!haystack.includes(q)) return false
      }
      return true
    })
    const value = (o: Order): string | number => {
      switch (sort.key) {
        case 'number': return o.number
        case 'recipient': return normalizeSearch(o.recipient.name)
        case 'city': return normalizeSearch(`${o.address.city} ${o.address.district}`)
        case 'date': return `${o.scheduledDate} ${o.timeWindow?.start ?? ''}`
        case 'status': return STATUS_ORDER.indexOf(o.status)
      }
    }
    return list.sort((a, b) => {
      const va = value(a)
      const vb = value(b)
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir
    })
  }, [orders.items, search, status, date, driverId, city, sort])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const visible = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
  const hasFilters = search || status !== 'all' || date !== 'all' || driverId !== 'all' || city !== 'all'

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v)
    setPage(0)
  }

  const clearFilters = () => {
    setSearch('')
    setStatus('all')
    setDate('all')
    setDriverId('all')
    setCity('all')
    setPage(0)
  }

  const header = (key: SortKey, label: string, className?: string) => (
    <th className={cn('px-4 py-2.5 font-medium', className)} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((s.dir * -1) as 1 | -1) : 1 }))}
        className="inline-flex items-center gap-1 hover:text-ink"
      >
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  )

  return (
    <Page>
      <PageHeader
        title="Pedidos"
        description={orders.loading ? 'Carregando…' : `${plural(orders.items.length, 'pedido', 'pedidos')} em aberto ou movimentados nos últimos 30 dias`}
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Novo pedido
          </Button>
        }
      />

      <div className="panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
            <Input
              value={search}
              onChange={(e) => resetPage(setSearch)(e.target.value)}
              placeholder="Buscar por número, nome, telefone ou bairro"
              className="pl-9"
              aria-label="Buscar pedido"
            />
          </div>
          <Select value={status} onChange={(e) => resetPage(setStatus)(e.target.value as StatusFilter)} aria-label="Status" className="w-[168px]">
            <option value="all">Todos os status</option>
            <option value="open">Em aberto</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_META[s].label}
              </option>
            ))}
          </Select>
          <Select value={date} onChange={(e) => resetPage(setDate)(e.target.value as DateFilter)} aria-label="Data prevista" className="w-[150px]">
            <option value="all">Qualquer data</option>
            <option value="today">Hoje</option>
            <option value="tomorrow">Amanhã</option>
            <option value="week">Últimos 7 dias</option>
          </Select>
          <Select value={driverId} onChange={(e) => resetPage(setDriverId)(e.target.value)} aria-label="Motorista" className="w-[196px]">
            <option value="all">Todos os motoristas</option>
            <option value="none">Sem motorista</option>
            {drivers.items
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </Select>
          <Select value={city} onChange={(e) => resetPage(setCity)(e.target.value)} aria-label="Cidade" className="w-[160px]">
            <option value="all">Todas as cidades</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Limpar filtros
            </Button>
          )}
        </div>

        {orders.loading ? (
          <SkeletonRows rows={8} />
        ) : orders.error ? (
          <EmptyState title="Não foi possível carregar os pedidos" description="Verifique a conexão e recarregue a página." />
        ) : filtered.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={<Search />}
              title="Nenhum pedido com esses filtros"
              action={<Button onClick={clearFilters}>Limpar filtros</Button>}
            />
          ) : (
            <EmptyState
              icon={<Package />}
              title="Nenhum pedido ainda"
              description="Cadastre o primeiro pedido para começar a planejar rotas."
              action={
                <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                  Novo pedido
                </Button>
              }
            />
          )
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    {header('number', 'Pedido')}
                    {header('recipient', 'Destinatário')}
                    {header('city', 'Endereço', 'hidden md:table-cell')}
                    {header('date', 'Previsto')}
                    <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Rota</th>
                    {header('status', 'Status', 'text-right [&>button]:ml-auto')}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((o) => {
                    const route = o.routeId ? routes.byId.get(o.routeId) : undefined
                    const driver = o.driverId ? drivers.byId.get(o.driverId) : undefined
                    return (
                      <tr key={o.id} className="table-row cursor-pointer hover:bg-sunken" onClick={() => openOrder(o.id)}>
                        <td className="px-4 py-2.5 align-top">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              openOrder(o.id)
                            }}
                            className="font-mono text-xs font-medium text-ink hover:text-accent-ink"
                          >
                            {o.number}
                          </button>
                          {o.reference && <p className="mt-0.5 truncate font-mono text-2xs text-faint">{o.reference}</p>}
                        </td>
                        <td className="max-w-[220px] px-4 py-2.5 align-top">
                          <p className="truncate font-medium">{o.recipient.name}</p>
                          <p className="tnum text-xs text-muted">{formatPhone(o.recipient.phone)}</p>
                        </td>
                        <td className="hidden max-w-[260px] px-4 py-2.5 align-top md:table-cell">
                          <p className="truncate text-ink-2">{o.address.district}</p>
                          <p className="text-xs text-muted">
                            {o.address.city} - {o.address.state}
                          </p>
                        </td>
                        <td className="px-4 py-2.5 align-top whitespace-nowrap">
                          <p className="text-ink-2">{formatRelativeDay(o.scheduledDate)}</p>
                          {o.timeWindow && (
                            <p className="tnum font-mono text-2xs text-muted">
                              {o.timeWindow.start}–{o.timeWindow.end}
                            </p>
                          )}
                        </td>
                        <td className="hidden px-4 py-2.5 align-top lg:table-cell">
                          {route ? (
                            <>
                              <p className="font-mono text-xs text-ink-2">
                                {route.code}
                                {o.routeSequence && <span className="text-faint"> · #{o.routeSequence}</span>}
                              </p>
                              <p className="text-xs text-muted">{driver ? firstName(driver.name) : 'Sem motorista'}</p>
                            </>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right align-top">
                          <OrderStatusBadge status={o.status} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-muted">
              <span className="tnum">
                {filtered.length <= PAGE_SIZE
                  ? plural(filtered.length, 'pedido', 'pedidos')
                  : `${current * PAGE_SIZE + 1}–${Math.min((current + 1) * PAGE_SIZE, filtered.length)} de ${filtered.length}`}
              </span>
              {pages > 1 && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" disabled={current === 0} onClick={() => setPage(current - 1)}>
                    Anterior
                  </Button>
                  <Button size="sm" variant="ghost" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
                    Próxima
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <OrderFormDialog open={creating} onClose={() => setCreating(false)} />
    </Page>
  )
}
