import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  canTransitionOrder,
  canTransitionRoute,
  canTransitionStop,
  InvalidTransitionError,
  assertOrderTransition,
  ORDER_TRANSITIONS,
  ROUTE_TRANSITIONS,
  STOP_TRANSITIONS,
} from '@/domain/status'
import { isValidPlate, normalizePlate } from '@/utils/format'
import { validateOrderInput, type OrderInput } from '@/services/ordersService'

/** Extrai a tabela de transições declarada em firestore.rules. */
function rulesTable(fnName: string): Record<string, string[]> {
  const rules = readFileSync('firestore.rules', 'utf8')
  const body = rules.slice(rules.indexOf(`function ${fnName}()`))
  const block = body.slice(body.indexOf('{', body.indexOf('return')), body.indexOf('};'))
  const table: Record<string, string[]> = {}
  for (const m of block.matchAll(/'([A-Z_]+)':\s*\[([^\]]*)\]/g))
    table[m[1]] = [...m[2].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1])
  return table
}

const sorted = (t: Record<string, readonly string[]>) =>
  Object.fromEntries(Object.entries(t).map(([k, v]) => [k, [...v].sort()]))

describe('máquinas de estado', () => {
  it('firestore.rules espelha as transições de pedido, rota e parada', () => {
    expect(sorted(rulesTable('orderTransitions'))).toEqual(sorted(ORDER_TRANSITIONS))
    expect(sorted(rulesTable('routeTransitions'))).toEqual(sorted(ROUTE_TRANSITIONS))
    expect(sorted(rulesTable('stopTransitions'))).toEqual(sorted(STOP_TRANSITIONS))
  })

  it('segue o fluxo principal do pedido', () => {
    const flow = ['CREATED', 'PLANNED', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED'] as const
    for (let i = 0; i < flow.length - 1; i++) expect(canTransitionOrder(flow[i], flow[i + 1])).toBe(true)
  })

  it('bloqueia atalhos e saídas de estados finais', () => {
    expect(canTransitionOrder('CREATED', 'DELIVERED')).toBe(false)
    expect(canTransitionOrder('ASSIGNED', 'DELIVERED')).toBe(false)
    expect(canTransitionOrder('DELIVERED', 'FAILED')).toBe(false)
    expect(canTransitionOrder('CANCELLED', 'CREATED')).toBe(false)
    expect(canTransitionOrder('IN_TRANSIT', 'CANCELLED')).toBe(false)
    expect(() => assertOrderTransition('DELIVERED', 'CREATED')).toThrow(InvalidTransitionError)
  })

  it('permite nova tentativa após falha', () => {
    expect(canTransitionOrder('IN_TRANSIT', 'FAILED')).toBe(true)
    expect(canTransitionOrder('FAILED', 'CREATED')).toBe(true)
  })

  it('rota só é concluída depois de iniciada', () => {
    expect(canTransitionRoute('ASSIGNED', 'COMPLETED')).toBe(false)
    expect(canTransitionRoute('IN_PROGRESS', 'COMPLETED')).toBe(true)
    expect(canTransitionRoute('IN_PROGRESS', 'CANCELLED')).toBe(false)
  })

  it('parada resolvida não volta', () => {
    expect(canTransitionStop('DELIVERED', 'PENDING')).toBe(false)
    expect(canTransitionStop('FAILED', 'DELIVERED')).toBe(false)
    expect(canTransitionStop('PENDING', 'DELIVERED')).toBe(true)
  })
})

describe('validações', () => {
  const valid: OrderInput = {
    reference: '',
    notes: '',
    recipient: { name: 'Ana Teste', phone: '(31) 99999-0000' },
    address: { zipCode: '30130-000', street: 'Rua A', number: '10', complement: '', district: 'Centro', city: 'Belo Horizonte', state: 'MG' },
    location: null,
    scheduledDate: '2026-09-28',
    timeWindow: null,
    deliveryNotes: '',
  }

  it('aceita pedido completo', () => {
    expect(validateOrderInput(valid)).toEqual({})
  })

  it('rejeita telefone, CEP e janela inválidos', () => {
    const errors = validateOrderInput({
      ...valid,
      recipient: { name: '', phone: '123' },
      address: { ...valid.address, zipCode: '301' },
      timeWindow: { start: '14:00', end: '10:00' },
    })
    expect(Object.keys(errors).sort()).toEqual(['address.zipCode', 'recipient.name', 'recipient.phone', 'timeWindow'])
  })

  it('normaliza e valida placas', () => {
    expect(normalizePlate('abc-1d23')).toBe('ABC1D23')
    expect(isValidPlate('ABC1D23')).toBe(true)
    expect(isValidPlate('ABC1234')).toBe(true)
    expect(isValidPlate('AB12345')).toBe(false)
  })
})
