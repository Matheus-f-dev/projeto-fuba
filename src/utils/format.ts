import type { Address } from '@/types/domain'

export function formatPhone(value: string) {
  const d = value.replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return value
}

export function formatZip(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

/** Placa no padrão Mercosul/antigo, sem hífen e em maiúsculas. */
export function normalizePlate(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)
}

export function isValidPlate(value: string) {
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizePlate(value))
}

export function addressLine(a: Address) {
  const main = [a.street, a.number].filter(Boolean).join(', ')
  return a.complement ? `${main} — ${a.complement}` : main
}

export function cityLine(a: Address) {
  return [a.district, [a.city, a.state].filter(Boolean).join(' - ')].filter(Boolean).join(', ')
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name
}

export function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

/** Busca sem acento e sem caixa. */
export function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}
