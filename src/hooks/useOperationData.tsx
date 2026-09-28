import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { driversService } from '@/services/driversService'
import { occurrencesService } from '@/services/occurrencesService'
import { ordersService } from '@/services/ordersService'
import { routesService } from '@/services/routesService'
import { vehiclesService } from '@/services/vehiclesService'
import type { Driver, Occurrence, Order, Route, Vehicle } from '@/types/domain'
import { useReadySession } from './useSession'

/**
 * Um listener por coleção operacional, compartilhado por todas as telas.
 * Trocar de página não abre novas leituras: o Firestore só envia o que mudou.
 */

interface Slice<T> {
  items: T[]
  byId: Map<string, T>
  loading: boolean
  error: Error | null
}

interface OperationData {
  orders: Slice<Order>
  routes: Slice<Route>
  drivers: Slice<Driver>
  vehicles: Slice<Vehicle>
  occurrences: Slice<Occurrence>
}

type Subscribe<T> = (orgId: string, onData: (items: T[]) => void, onError: (e: Error) => void) => () => void

function useSlice<T extends { id: string }>(orgId: string, subscribe: Subscribe<T>): Slice<T> {
  const [state, setState] = useState<{ items: T[]; loading: boolean; error: Error | null }>({
    items: [],
    loading: true,
    error: null,
  })
  useEffect(() => {
    setState({ items: [], loading: true, error: null })
    return subscribe(
      orgId,
      (items) => setState({ items, loading: false, error: null }),
      (error) => {
        console.error(error)
        setState((s) => ({ ...s, loading: false, error }))
      },
    )
  }, [orgId, subscribe])
  return useMemo(() => ({ ...state, byId: new Map(state.items.map((i) => [i.id, i])) }), [state])
}

const Ctx = createContext<OperationData | null>(null)

export function OperationDataProvider({ children }: { children: ReactNode }) {
  const { ctx } = useReadySession()
  const orgId = ctx.organizationId
  const orders = useSlice(orgId, ordersService.subscribe)
  const routes = useSlice(orgId, routesService.subscribe)
  const drivers = useSlice(orgId, driversService.subscribe)
  const vehicles = useSlice(orgId, vehiclesService.subscribe)
  const occurrences = useSlice(orgId, occurrencesService.subscribe)

  const value = useMemo(
    () => ({ orders, routes, drivers, vehicles, occurrences }),
    [orders, routes, drivers, vehicles, occurrences],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useOperationData() {
  const value = useContext(Ctx)
  if (!value) throw new Error('useOperationData fora do OperationDataProvider')
  return value
}
