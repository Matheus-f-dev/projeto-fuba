import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import { DEFAULT_CENTER, type MapMarker, type MapViewProps, type MarkerVariant } from './MapView'

const TILE_URL = import.meta.env.VITE_MAP_TILE_URL as string | undefined
const ATTRIBUTION = (import.meta.env.VITE_MAP_ATTRIBUTION as string | undefined) ?? ''

const pinStyle: Record<MarkerVariant, { size: number; html: (label: string) => string }> = {
  'stop-pending': {
    size: 24,
    html: (l) => circle(24, '#fff', '#14181b', '#14181b', l),
  },
  'stop-next': {
    size: 28,
    html: (l) => circle(28, '#2e4bdb', '#fff', '#fff', l, '0 0 0 4px rgb(46 75 219 / 0.22)'),
  },
  'stop-delivered': {
    size: 22,
    html: (l) => circle(22, '#1d8049', '#fff', '#fff', l),
  },
  'stop-failed': {
    size: 22,
    html: (l) => circle(22, '#c4321f', '#fff', '#fff', l),
  },
  order: {
    size: 14,
    html: () => circle(14, '#fff', '#4d6070', '#4d6070', ''),
  },
  'order-selected': {
    size: 24,
    html: (l) => circle(24, '#14181b', '#fff', '#fff', l),
  },
  driver: {
    size: 34,
    html: () =>
      `<div style="position:relative;width:34px;height:34px;display:grid;place-items:center">
        <span style="position:absolute;inset:0;border-radius:999px;background:rgb(46 75 219 / 0.16)"></span>
        <span style="width:18px;height:18px;border-radius:999px;background:#14181b;border:3px solid #fff;box-shadow:0 1px 4px rgb(0 0 0 / .35)"></span>
      </div>`,
  },
}

function circle(size: number, bg: string, border: string, color: string, label: string, ring = '') {
  const font = size >= 24 ? 11 : 10
  return `<div style="width:${size}px;height:${size}px;border-radius:999px;background:${bg};border:2px solid ${border};color:${color};
    display:grid;place-items:center;font:600 ${font}px/1 'Geist Mono',monospace;box-shadow:0 1px 3px rgb(0 0 0 / .25)${ring ? ',' + ring : ''}">${label}</div>`
}

function icon(marker: MapMarker) {
  const style = pinStyle[marker.variant]
  return L.divIcon({
    className: 'map-pin',
    html: style.html(marker.label ?? ''),
    iconSize: [style.size, style.size],
    iconAnchor: [style.size / 2, style.size / 2],
  })
}

export default function LeafletMap({ markers, paths = [], fitKey, onMapClick }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const clickRef = useRef(onMapClick)
  clickRef.current = onMapClick
  // Enquadramento pendente: refeito quando o container muda de tamanho,
  // até o usuário mexer no mapa (o primeiro fit pode ocorrer com tamanho 0).
  const fitRef = useRef<() => void>(() => {})
  const interactedRef = useRef(false)

  // Cria o mapa uma vez
  useEffect(() => {
    const map = L.map(containerRef.current!, {
      center: [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
      zoom: 12,
      zoomControl: false,
      attributionControl: Boolean(TILE_URL),
    })
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    if (TILE_URL) L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map)
    map.on('click', (e: L.LeafletMouseEvent) => clickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }))
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    const container = containerRef.current!
    const markInteracted = () => (interactedRef.current = true)
    container.addEventListener('pointerdown', markInteracted)
    container.addEventListener('wheel', markInteracted, { passive: true })
    const resize = new ResizeObserver(() => {
      map.invalidateSize()
      if (!interactedRef.current) fitRef.current()
    })
    resize.observe(container)
    return () => {
      resize.disconnect()
      container.removeEventListener('pointerdown', markInteracted)
      container.removeEventListener('wheel', markInteracted)
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Redesenha camadas quando os dados mudam
  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    layer.clearLayers()
    for (const path of paths) {
      if (path.points.length < 2) continue
      L.polyline(
        path.points.map((p) => [p.lat, p.lng] as [number, number]),
        path.variant === 'planned'
          ? { color: '#14181b', weight: 2.5, opacity: 0.55, dashArray: '6 6' }
          : { color: '#2e4bdb', weight: 4, opacity: 0.75 },
      ).addTo(layer)
    }
    for (const m of markers) {
      const marker = L.marker([m.position.lat, m.position.lng], {
        icon: icon(m),
        title: m.title,
        keyboard: Boolean(m.onClick),
        zIndexOffset: m.variant === 'driver' ? 1000 : m.variant === 'stop-next' ? 500 : 0,
      })
      if (m.onClick) marker.on('click', m.onClick)
      marker.addTo(layer)
    }
  }, [markers, paths])

  // Reenquadra quando o conjunto exibido muda (fitKey) ou quando chegam marcadores
  // que ainda estavam carregando — neste caso, só se o usuário não mexeu no mapa.
  const lastFitKey = useRef<string | undefined>(undefined)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const keyChanged = lastFitKey.current !== fitKey
    lastFitKey.current = fitKey
    if (!keyChanged && interactedRef.current) return
    const points = [
      ...markers.map((m) => [m.position.lat, m.position.lng] as [number, number]),
      ...paths.flatMap((p) => p.points.map((pt) => [pt.lat, pt.lng] as [number, number])),
    ]
    if (points.length === 0) return
    // Sem animação: o Leaflet descarta um novo enquadramento enquanto anima o anterior
    fitRef.current = () => {
      if (points.length === 1) map.setView(points[0], 15, { animate: false })
      else map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15, animate: false })
    }
    interactedRef.current = false
    fitRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, markers.length])

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />
      {!TILE_URL && (
        <p className="pointer-events-none absolute top-3 left-3 z-[500] rounded-md bg-surface/90 px-2 py-1 text-2xs text-muted">
          Camada de mapa não configurada (VITE_MAP_TILE_URL)
        </p>
      )}
    </>
  )
}
