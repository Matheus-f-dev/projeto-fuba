/**
 * Fluxo principal de ponta a ponta usando os services reais, autenticado,
 * contra o emulador COM as regras de segurança ativas.
 *
 *   pedido → rota → motorista + veículo → início → localização
 *   → chegada → entrega com comprovante → falha → finalização → histórico
 */
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc, getDocs, query, collection, setDoc, where, type Firestore } from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auth, db, useEmulators } from '@/firebase/app'
import { DomainError, type SessionContext } from '@/services/context'
import { deliveryProofService } from '@/services/deliveryProofService'
import { driversService } from '@/services/driversService'
import { locationService } from '@/services/locationService'
import { occurrencesService } from '@/services/occurrencesService'
import { ordersService, type OrderInput } from '@/services/ordersService'
import { routesService } from '@/services/routesService'
import { stopsService } from '@/services/stopsService'
import { vehiclesService } from '@/services/vehiclesService'
import type { ProcessedImage } from '@/utils/compressImage'

const run = Math.random().toString(36).slice(2, 8)
const ORG = `org-flow-${run}`
const email = `operador-${run}@flow.test`
let env: RulesTestEnvironment
let ctx: SessionContext

const input = (name: string, i: number): OrderInput => ({
  reference: `NF ${i}`,
  notes: '',
  recipient: { name, phone: '31999990000' },
  address: { zipCode: '30130000', street: 'Rua Teste', number: String(i), complement: '', district: 'Centro', city: 'Belo Horizonte', state: 'MG' },
  location: { lat: -19.92 + i * 0.001, lng: -43.93 },
  scheduledDate: '2026-09-28',
  timeWindow: null,
  deliveryNotes: '',
})

const read = async (path: string) => (await getDoc(doc(db, path))).data()!

const tinyImage: ProcessedImage = {
  dataUrl: 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==',
  mimeType: 'image/webp',
  bytes: 64,
  width: 1,
  height: 1,
}

beforeAll(async () => {
  // Trava de segurança: este teste grava dados e só pode rodar contra o emulador
  if (!useEmulators || !String(auth.app.options.projectId).startsWith('demo-'))
    throw new Error('flow.test.ts só roda contra os emuladores (projeto demo-*).')
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
  env = await initializeTestEnvironment({
    projectId: 'demo-fuba',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
  })
  const cred = await createUserWithEmailAndPassword(auth, email, 'senha-teste-123')
  await env.withSecurityRulesDisabled(async (c) => {
    const admin = c.firestore() as unknown as Firestore
    await setDoc(doc(admin, `organizations/${ORG}`), {
      name: 'Org Fluxo', document: '', status: 'ACTIVE', orderSeq: 0, routeSeq: 0, createdAt: new Date(), updatedAt: new Date(),
    })
    await setDoc(doc(admin, `users/${cred.user.uid}`), {
      organizationId: ORG, name: 'Operador Fluxo', email, phone: '', role: 'OPERATOR', status: 'ACTIVE',
      createdAt: new Date(), updatedAt: new Date(),
    })
  })
  await signInWithEmailAndPassword(auth, email, 'senha-teste-123')
  ctx = { organizationId: ORG, role: 'OPERATOR', actor: { uid: cred.user.uid, name: 'Operador Fluxo' } }
})

afterAll(async () => {
  await signOut(auth)
  await env?.cleanup()
})

describe('fluxo principal da entrega', () => {
  let driverId: string
  let vehicleId: string
  const orderIds: string[] = []
  let routeId: string

  it('cadastra motorista e veículo', async () => {
    driverId = await driversService.create(ctx, { name: 'Motorista Fluxo', phone: '31988887777', document: '', license: '', licenseCategory: 'B' })
    vehicleId = await vehiclesService.create(ctx, { plate: 'ABC1D23', model: 'Utilitário', type: 'UTILITARIO', capacityKg: 600, capacityVolumes: null }, [])
    expect((await read(`drivers/${driverId}`)).status).toBe('ACTIVE')
  })

  it('cria pedidos com número sequencial e status CREATED', async () => {
    for (const [i, name] of ['Ana', 'Bruno', 'Carla'].entries()) {
      const { id, number } = await ordersService.create(ctx, input(name, i + 1))
      orderIds.push(id)
      expect(number).toBe(`PED-000${i + 1}`)
    }
    expect((await read(`orders/${orderIds[0]}`)).status).toBe('CREATED')
    expect((await read(`organizations/${ORG}`)).orderSeq).toBe(3)
  })

  it('cria a rota já atribuída, na sequência escolhida', async () => {
    const created = await routesService.create(ctx, {
      date: '2026-09-28',
      orderIds: [orderIds[2], orderIds[0], orderIds[1]],
      driverId,
      vehicleId,
      plannedStartAt: '08:00',
      notes: '',
    })
    routeId = created.id
    expect(created.code).toBe('R-001')
    const route = await read(`routes/${routeId}`)
    expect(route.status).toBe('ASSIGNED')
    expect(route.stopCount).toBe(3)
    const carla = await read(`orders/${orderIds[2]}`)
    expect(carla.status).toBe('ASSIGNED')
    expect(carla.routeSequence).toBe(1)
  })

  it('não deixa o mesmo motorista em duas rotas ativas', async () => {
    const extra = await ordersService.create(ctx, input('Extra', 9))
    await expect(
      routesService.create(ctx, { date: '2026-09-28', orderIds: [extra.id], driverId, vehicleId, plannedStartAt: null, notes: '' }),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('reordena e remove parada antes da saída', async () => {
    const stops = await getDocs(query(collection(db, 'routeStops'), where('organizationId', '==', ORG), where('routeId', '==', routeId)))
    const bySeq = stops.docs.sort((a, b) => a.data().sequence - b.data().sequence).map((d) => d.id)
    await routesService.reorder(ctx, routeId, [bySeq[1], bySeq[0], bySeq[2]]) // Ana, Carla, Bruno
    expect((await read(`orders/${orderIds[0]}`)).routeSequence).toBe(1)

    await routesService.removeStop(ctx, routeId, bySeq[2]) // Bruno sai
    const bruno = await read(`orders/${orderIds[1]}`)
    expect(bruno.status).toBe('CREATED')
    expect(bruno.routeId).toBeNull()
    expect((await read(`routes/${routeId}`)).stopCount).toBe(2)
  })

  it('inicia a rota e coloca os pedidos em trânsito', async () => {
    await routesService.start(ctx, routeId)
    expect((await read(`routes/${routeId}`)).status).toBe('IN_PROGRESS')
    expect((await read(`orders/${orderIds[0]}`)).status).toBe('IN_TRANSIT')
  })

  it('registra localização respeitando o intervalo mínimo', async () => {
    expect(await locationService.record(ctx, routeId, { lat: -19.9, lng: -43.9, accuracy: 10 })).toBe(true)
    expect(await locationService.record(ctx, routeId, { lat: -19.9, lng: -43.9, accuracy: 10 })).toBe(false)
    expect((await read(`routes/${routeId}`)).lastLocation.lat).toBe(-19.9)
    expect((await locationService.getTrail(ORG, routeId)).length).toBe(1)
  })

  it('não finaliza com paradas pendentes', async () => {
    await expect(routesService.finish(ctx, routeId)).rejects.toBeInstanceOf(DomainError)
  })

  it('registra chegada, entrega com comprovante e falha', async () => {
    const ana = await read(`orders/${orderIds[0]}`)
    const carla = await read(`orders/${orderIds[2]}`)

    await stopsService.arrive(ctx, ana.stopId)
    await stopsService.deliver(ctx, ana.stopId, { recipientName: 'Ana (porteiro)', notes: 'Portaria', image: tinyImage, location: null })
    const delivered = await read(`orders/${orderIds[0]}`)
    expect(delivered.status).toBe('DELIVERED')
    expect(delivered.proof.hasImage).toBe(true)
    const proof = await deliveryProofService.get(ctx, delivered.proof.id)
    expect(proof.imageData).toBe(tinyImage.dataUrl)
    expect(proof.recipientName).toBe('Ana (porteiro)')

    // Entregar de novo é bloqueado pela máquina de estados
    await expect(stopsService.deliver(ctx, ana.stopId, { recipientName: 'X', notes: '', image: null, location: null })).rejects.toThrow()

    await stopsService.fail(ctx, carla.stopId, { type: 'DESTINATARIO_AUSENTE', description: 'Ninguém em casa' })
    const failed = await read(`orders/${orderIds[2]}`)
    expect(failed.status).toBe('FAILED')
    expect(failed.attempts).toBe(1)
    const occ = await read(`occurrences/${(await read(`routeStops/${carla.stopId}`)).occurrenceId}`)
    expect(occ.status).toBe('OPEN')

    const route = await read(`routes/${routeId}`)
    expect(route.deliveredCount).toBe(1)
    expect(route.failedCount).toBe(1)
  })

  it('finaliza a rota', async () => {
    await routesService.finish(ctx, routeId)
    const route = await read(`routes/${routeId}`)
    expect(route.status).toBe('COMPLETED')
    expect(route.finishedAt).toBeTruthy()
  })

  it('grava o histórico completo do pedido entregue', async () => {
    const snap = await getDocs(query(collection(db, 'statusHistory'), where('organizationId', '==', ORG), where('orderId', '==', orderIds[0])))
    const events = snap.docs.map((d) => d.data()).sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis()).map((d) => d.event)
    for (const e of ['ORDER_CREATED', 'ADDED_TO_ROUTE', 'DRIVER_ASSIGNED', 'ROUTE_STARTED', 'STOP_ARRIVED', 'DELIVERED', 'PROOF_REGISTERED'])
      expect(events).toContain(e)
    expect(snap.docs.every((d) => d.data().changedBy.uid === ctx.actor.uid)).toBe(true)
  })

  it('reagenda o pedido não entregue e resolve a ocorrência', async () => {
    await ordersService.reschedule(ctx, orderIds[2], '2026-09-29')
    const carla = await read(`orders/${orderIds[2]}`)
    expect(carla.status).toBe('CREATED')
    expect(carla.routeId).toBeNull()
    expect(carla.attempts).toBe(1)

    const open = await getDocs(query(collection(db, 'occurrences'), where('organizationId', '==', ORG), where('status', '==', 'OPEN')))
    await occurrencesService.resolve(ctx, open.docs[0].id, 'Reagendado com o cliente')
    expect((await read(`occurrences/${open.docs[0].id}`)).status).toBe('RESOLVED')
  })
})

describe('rota grande (limites de transação e de leituras nas regras)', () => {
  it('cria e inicia uma rota com 30 paradas em uma única transação', async () => {
    const driverId = await driversService.create(ctx, { name: 'Motorista Grande', phone: '31988886666', document: '', license: '', licenseCategory: 'B' })
    const vehicleId = await vehiclesService.create(ctx, { plate: 'XYZ9K87', model: 'Van', type: 'VAN', capacityKg: 1500, capacityVolumes: null }, [])
    const ids: string[] = []
    for (let i = 0; i < 30; i++) ids.push((await ordersService.create(ctx, input(`Pessoa ${i}`, i))).id)

    const { id } = await routesService.create(ctx, { date: '2026-09-28', orderIds: ids, driverId, vehicleId, plannedStartAt: null, notes: '' })
    await routesService.start(ctx, id)
    const orders = await Promise.all(ids.map((o) => read(`orders/${o}`)))
    expect(orders.every((o) => o.status === 'IN_TRANSIT')).toBe(true)
  }, 60_000)
})
