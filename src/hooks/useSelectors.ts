import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import type { Driver, Route, Vehicle } from '@/types/domain'
import { useOperationData } from './useOperationData'

/** Rota ativa (atribuída ou em andamento) de cada motorista e veículo. */
export function useActiveAssignments() {
  const { routes } = useOperationData()
  return useMemo(() => {
    const byDriver = new Map<string, Route>()
    const byVehicle = new Map<string, Route>()
    for (const r of routes.items) {
      if (r.status !== 'ASSIGNED' && r.status !== 'IN_PROGRESS') continue
      // Em andamento tem prioridade sobre atribuída
      if (r.driverId && (!byDriver.has(r.driverId) || r.status === 'IN_PROGRESS')) byDriver.set(r.driverId, r)
      if (r.vehicleId && (!byVehicle.has(r.vehicleId) || r.status === 'IN_PROGRESS')) byVehicle.set(r.vehicleId, r)
    }
    return { byDriver, byVehicle }
  }, [routes.items])
}

export type ResourceState = 'on-route' | 'assigned' | 'available' | 'inactive'

export function resourceState(item: Driver | Vehicle, activeRoute: Route | undefined): ResourceState {
  if (item.status === 'INACTIVE') return 'inactive'
  if (activeRoute?.status === 'IN_PROGRESS') return 'on-route'
  if (activeRoute) return 'assigned'
  return 'available'
}

export const RESOURCE_STATE_META: Record<ResourceState, { label: string; tone: 'accent' | 'violet' | 'success' | 'neutral' }> = {
  'on-route': { label: 'Em rota', tone: 'accent' },
  assigned: { label: 'Rota atribuída', tone: 'violet' },
  available: { label: 'Disponível', tone: 'success' },
  inactive: { label: 'Inativo', tone: 'neutral' },
}

/** Abre o detalhe do pedido (painel lateral) a partir de qualquer tela, via ?pedido=ID. */
export function useOrderSheet() {
  const [params, setParams] = useSearchParams()
  const orderId = params.get('pedido')
  const open = useCallback(
    (id: string) =>
      setParams((p) => {
        const next = new URLSearchParams(p)
        next.set('pedido', id)
        return next
      }),
    [setParams],
  )
  const close = useCallback(
    () =>
      setParams((p) => {
        const next = new URLSearchParams(p)
        next.delete('pedido')
        return next
      }),
    [setParams],
  )
  return { orderId, open, close }
}
