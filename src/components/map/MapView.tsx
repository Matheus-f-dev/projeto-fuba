import { lazy, Suspense } from 'react'
import type { GeoPoint } from '@/types/domain'
import { cn } from '@/utils/cn'
import { Skeleton } from '../ui/Spinner'

/**
 * Contrato de mapa usado pelas telas. As telas nunca importam o provedor:
 * para trocar Leaflet/OSM por outro serviço, implemente este contrato em
 * outro arquivo e altere apenas o import abaixo.
 */

export type MarkerVariant =
  | 'stop-pending'
  | 'stop-next'
  | 'stop-delivered'
  | 'stop-failed'
  | 'order'
  | 'order-selected'
  | 'driver'

export interface MapMarker {
  id: string
  position: GeoPoint
  variant: MarkerVariant
  /** Texto dentro do marcador (ex.: número da parada). */
  label?: string
  /** Texto ao passar o mouse. */
  title?: string
  onClick?: () => void
}

export interface MapPath {
  id: string
  points: GeoPoint[]
  variant: 'planned' | 'trail'
}

export interface MapViewProps {
  markers: MapMarker[]
  paths?: MapPath[]
  /** Quando muda, o mapa reenquadra para mostrar todos os marcadores. */
  fitKey?: string
  onMapClick?: (point: GeoPoint) => void
  className?: string
}

export const DEFAULT_CENTER: GeoPoint = { lat: -19.9245, lng: -43.9352 } // Belo Horizonte

const LeafletMap = lazy(() => import('./LeafletMap'))

export function MapView(props: MapViewProps) {
  return (
    // className define posição/tamanho (ex.: "absolute inset-0" ou "h-64"); o miolo ocupa tudo
    <div className={cn('isolate overflow-hidden bg-[#e9ece8]', props.className)}>
      <div className="relative h-full w-full">
        <Suspense fallback={<Skeleton className="absolute inset-0 rounded-none" />}>
          <LeafletMap {...props} />
        </Suspense>
      </div>
    </div>
  )
}
