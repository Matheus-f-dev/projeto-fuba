import { onSnapshot, type Query } from 'firebase/firestore'
import { reviveDates } from '@/firebase/collections'

export type Unsubscribe = () => void

/**
 * Listener em tempo real que devolve documentos já tipados.
 * serverTimestamps: 'estimate' evita datas nulas em escritas ainda pendentes.
 */
export function listen<T>(
  q: Query,
  onData: (items: T[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    q,
    (snap) =>
      onData(
        snap.docs.map((d) =>
          reviveDates<T>({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }),
        ),
      ),
    onError,
  )
}

/** Une vários listeners, deduplicando por id (ex.: "em aberto" + "recentes"). */
export function listenMerged<T extends { id: string }>(
  queries: Query[],
  onData: (items: T[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const parts: (T[] | null)[] = queries.map(() => null)
  const unsubs = queries.map((q, i) =>
    listen<T>(
      q,
      (items) => {
        parts[i] = items
        if (parts.every(Boolean)) {
          const byId = new Map<string, T>()
          for (const list of parts) for (const item of list!) byId.set(item.id, item)
          onData([...byId.values()])
        }
      },
      onError,
    ),
  )
  return () => unsubs.forEach((u) => u())
}
