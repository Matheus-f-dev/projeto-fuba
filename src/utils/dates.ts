import { format, formatDistanceToNowStrict, isToday, isYesterday, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/** Data local no formato YYYY-MM-DD (datas operacionais são sempre locais). */
export function toISODate(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

export function todayISO() {
  return toISODate(new Date())
}

export function addDaysISO(iso: string, days: number) {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

export function daysAgo(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d
}

export function formatDate(iso: string) {
  return format(parseISO(iso), 'dd/MM/yyyy')
}

/** "Hoje", "Amanhã", "Ontem" ou dd/MM. */
export function formatRelativeDay(iso: string) {
  const today = todayISO()
  if (iso === today) return 'Hoje'
  if (iso === addDaysISO(today, 1)) return 'Amanhã'
  if (iso === addDaysISO(today, -1)) return 'Ontem'
  return format(parseISO(iso), 'dd/MM')
}

export function formatTime(date: Date | null | undefined) {
  return date ? format(date, 'HH:mm') : '—'
}

export function formatDateTime(date: Date | null | undefined) {
  if (!date) return '—'
  if (isToday(date)) return `Hoje, ${format(date, 'HH:mm')}`
  if (isYesterday(date)) return `Ontem, ${format(date, 'HH:mm')}`
  return format(date, 'dd/MM/yyyy HH:mm')
}

export function formatLongDate(date: Date) {
  return format(date, "EEEE, d 'de' MMMM", { locale: ptBR })
}

export function timeAgo(date: Date | null | undefined) {
  if (!date) return '—'
  const seconds = (Date.now() - date.getTime()) / 1000
  if (seconds < 60) return 'agora'
  return `há ${formatDistanceToNowStrict(date, { locale: ptBR })}`
}
