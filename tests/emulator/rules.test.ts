/**
 * Testes das regras do Firestore contra o emulador.
 * Rodar: npm run test:rules  (sobe o emulador, executa e derruba)
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, it } from 'vitest'

const run = Math.random().toString(36).slice(2, 8)
const ORG_A = `org-a-${run}`
const ORG_B = `org-b-${run}`

const USERS = {
  adminA: { uid: `adminA-${run}`, org: ORG_A, role: 'ADMIN', status: 'ACTIVE' },
  opA: { uid: `opA-${run}`, org: ORG_A, role: 'OPERATOR', status: 'ACTIVE' },
  driverA: { uid: `driverA-${run}`, org: ORG_A, role: 'DRIVER', status: 'ACTIVE' },
  blockedA: { uid: `blockedA-${run}`, org: ORG_A, role: 'OPERATOR', status: 'INACTIVE' },
  opB: { uid: `opB-${run}`, org: ORG_B, role: 'OPERATOR', status: 'ACTIVE' },
}

let env: RulesTestEnvironment
const fs = (uid?: string): Firestore =>
  (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore()) as unknown as Firestore
const actor = (uid: string) => ({ uid, name: 'Teste' })

function orderData(org: string, overrides: Record<string, unknown> = {}) {
  return {
    organizationId: org,
    number: 'PED-0001',
    reference: '',
    notes: '',
    recipient: { name: 'Destinatário Teste', phone: '31999990000' },
    address: { zipCode: '30130000', street: 'Rua A', number: '1', complement: '', district: 'Centro', city: 'Belo Horizonte', state: 'MG' },
    location: null,
    scheduledDate: '2026-09-28',
    timeWindow: null,
    deliveryNotes: '',
    status: 'CREATED',
    routeId: null,
    stopId: null,
    routeSequence: null,
    driverId: null,
    vehicleId: null,
    attempts: 0,
    proof: null,
    deliveredAt: null,
    createdBy: actor(USERS.opA.uid),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  }
}

function routeData(org: string, overrides: Record<string, unknown> = {}) {
  return {
    organizationId: org,
    code: 'R-001',
    date: '2026-09-28',
    status: 'IN_PROGRESS',
    driverId: 'drv-1',
    vehicleId: 'veh-1',
    stopCount: 2,
    deliveredCount: 0,
    failedCount: 0,
    plannedStartAt: null,
    startedAt: null,
    finishedAt: null,
    lastLocation: null,
    notes: '',
    createdBy: actor(USERS.opA.uid),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  }
}

/** Grava sem regras (estado inicial do teste). */
async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, path), data)
  })
}

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
  env = await initializeTestEnvironment({
    projectId: 'demo-fuba',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
  })
  for (const u of Object.values(USERS))
    await seed(`users/${u.uid}`, {
      organizationId: u.org, name: u.uid, email: `${u.uid}@t.test`, phone: '', role: u.role, status: u.status,
      createdAt: new Date(), updatedAt: new Date(),
    })
  for (const org of [ORG_A, ORG_B])
    await seed(`organizations/${org}`, { name: org, document: '', status: 'ACTIVE', orderSeq: 5, routeSeq: 2, createdAt: new Date(), updatedAt: new Date() })
  await seed(`orders/a-${run}`, { ...orderData(ORG_A), createdAt: new Date(), updatedAt: new Date() })
  await seed(`orders/b-${run}`, { ...orderData(ORG_B), createdAt: new Date(), updatedAt: new Date() })
  await seed(`routes/r-${run}`, { ...routeData(ORG_A), createdAt: new Date(), updatedAt: new Date() })
})

afterAll(async () => {
  await env?.cleanup()
})

describe('acesso e isolamento', () => {
  it('sem login não lê nada', async () => {
    await assertFails(getDoc(doc(fs(), `orders/a-${run}`)))
  })

  it('usuário sem perfil não lê pedidos', async () => {
    await assertFails(getDoc(doc(fs('sem-perfil'), `orders/a-${run}`)))
  })

  it('operador lê pedidos da própria organização', async () => {
    await assertSucceeds(getDoc(doc(fs(USERS.opA.uid), `orders/a-${run}`)))
    await assertSucceeds(getDocs(query(collection(fs(USERS.opA.uid), 'orders'), where('organizationId', '==', ORG_A))))
  })

  it('operador não lê pedidos de outra organização', async () => {
    await assertFails(getDoc(doc(fs(USERS.opA.uid), `orders/b-${run}`)))
    await assertFails(getDocs(query(collection(fs(USERS.opA.uid), 'orders'), where('organizationId', '==', ORG_B))))
    await assertFails(getDocs(collection(fs(USERS.opA.uid), 'orders')))
  })

  it('operador não cria registro em outra organização', async () => {
    await assertFails(setDoc(doc(fs(USERS.opA.uid), `orders/x-${run}`), orderData(ORG_B)))
  })

  it('usuário desativado perde o acesso', async () => {
    await assertFails(getDoc(doc(fs(USERS.blockedA.uid), `orders/a-${run}`)))
  })

  it('motorista não acessa o painel operacional', async () => {
    await assertFails(getDoc(doc(fs(USERS.driverA.uid), `orders/a-${run}`)))
  })

  it('usuário não altera o próprio papel nem a organização', async () => {
    await assertFails(updateDoc(doc(fs(USERS.opA.uid), `users/${USERS.opA.uid}`), { role: 'ADMIN' }))
    await assertFails(updateDoc(doc(fs(USERS.opA.uid), `users/${USERS.opA.uid}`), { organizationId: ORG_B }))
    await assertSucceeds(updateDoc(doc(fs(USERS.opA.uid), `users/${USERS.opA.uid}`), { name: 'Novo Nome', updatedAt: serverTimestamp() }))
  })

  it('admin não cria usuário em outra organização', async () => {
    const data = { organizationId: ORG_B, name: 'X', email: 'x@t.test', phone: '', role: 'ADMIN', status: 'ACTIVE', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
    await assertFails(setDoc(doc(fs(USERS.adminA.uid), `users/novo-${run}`), data))
    await assertSucceeds(setDoc(doc(fs(USERS.adminA.uid), `users/novo-${run}`), { ...data, organizationId: ORG_A, role: 'OPERATOR' }))
  })
})

describe('pedidos', () => {
  it('cria somente com status CREATED, autor e horário do servidor', async () => {
    const db = fs(USERS.opA.uid)
    await assertFails(setDoc(doc(db, `orders/n1-${run}`), orderData(ORG_A, { status: 'DELIVERED' })))
    await assertFails(setDoc(doc(db, `orders/n2-${run}`), orderData(ORG_A, { createdBy: actor('outra-pessoa') })))
    await assertFails(setDoc(doc(db, `orders/n3-${run}`), orderData(ORG_A, { createdAt: new Date('2020-01-01') })))
    await assertSucceeds(setDoc(doc(db, `orders/n4-${run}`), orderData(ORG_A)))
  })

  it('não permite transição fora da máquina de estados', async () => {
    const ref = doc(fs(USERS.opA.uid), `orders/a-${run}`)
    await assertFails(updateDoc(ref, { status: 'IN_TRANSIT', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { status: 'DELIVERED', updatedAt: serverTimestamp() }))
  })

  it('exige horário do servidor em updatedAt e não permite mudar número', async () => {
    const ref = doc(fs(USERS.opA.uid), `orders/a-${run}`)
    await assertFails(updateDoc(ref, { notes: 'x', updatedAt: new Date('2020-01-01') }))
    await assertFails(updateDoc(ref, { number: 'PED-9999', updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(ref, { notes: 'ok', updatedAt: serverTimestamp() }))
  })

  it('pedidos não podem ser apagados', async () => {
    await assertFails(deleteDoc(doc(fs(USERS.adminA.uid), `orders/a-${run}`)))
  })

  it('só vira ENTREGUE com comprovante gravado no mesmo lote', async () => {
    const id = `t-${run}`
    await seed(`orders/${id}`, { ...orderData(ORG_A, { status: 'IN_TRANSIT' }), createdAt: new Date(), updatedAt: new Date() })
    const db = fs(USERS.opA.uid)
    await assertFails(
      updateDoc(doc(db, `orders/${id}`), {
        status: 'DELIVERED',
        proof: { id: 'nao-existe', recipientName: 'X', hasImage: false, deliveredAt: serverTimestamp() },
        updatedAt: serverTimestamp(),
      }),
    )
    const batch = writeBatch(db)
    const proofId = `p-${run}`
    batch.set(doc(db, `deliveryProofs/${proofId}`), {
      organizationId: ORG_A, orderId: id, routeId: null, stopId: null, driverId: null, recipientName: 'Fulano',
      notes: '', imageData: null, imageMimeType: null, imageBytes: null, latitude: null, longitude: null,
      createdBy: actor(USERS.opA.uid), createdAt: serverTimestamp(),
    })
    batch.update(doc(db, `orders/${id}`), {
      status: 'DELIVERED',
      proof: { id: proofId, recipientName: 'Fulano', hasImage: false, deliveredAt: serverTimestamp() },
      updatedAt: serverTimestamp(),
    })
    await assertSucceeds(batch.commit())
  })
})

describe('contador da organização', () => {
  it('só avança de um em um', async () => {
    const ref = doc(fs(USERS.opA.uid), `organizations/${ORG_A}`)
    await assertFails(updateDoc(ref, { orderSeq: 1, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { orderSeq: 7, updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(ref, { orderSeq: 6, updatedAt: serverTimestamp() }))
  })

  it('operador não renomeia a organização', async () => {
    await assertFails(updateDoc(doc(fs(USERS.opA.uid), `organizations/${ORG_A}`), { name: 'X', updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(doc(fs(USERS.adminA.uid), `organizations/${ORG_A}`), { name: 'Nova', updatedAt: serverTimestamp() }))
  })
})

describe('rotas', () => {
  it('não conclui com paradas pendentes', async () => {
    const ref = doc(fs(USERS.opA.uid), `routes/r-${run}`)
    await assertFails(updateDoc(ref, { status: 'COMPLETED', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { deliveredCount: 3, updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(ref, { deliveredCount: 1, failedCount: 1, updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(ref, { status: 'COMPLETED', updatedAt: serverTimestamp() }))
  })

  it('rota atribuída precisa de motorista e veículo', async () => {
    await assertFails(setDoc(doc(fs(USERS.opA.uid), `routes/r2-${run}`), routeData(ORG_A, { status: 'ASSIGNED', driverId: null })))
    await assertSucceeds(setDoc(doc(fs(USERS.opA.uid), `routes/r3-${run}`), routeData(ORG_A, { status: 'DRAFT', driverId: null, vehicleId: null })))
  })
})

describe('histórico, comprovantes e localização', () => {
  const entry = (overrides: Record<string, unknown> = {}) => ({
    organizationId: ORG_A, event: 'ORDER_UPDATED', message: 'teste', orderId: `a-${run}`, routeId: null,
    previousStatus: null, newStatus: null, changedBy: actor(USERS.opA.uid), createdAt: serverTimestamp(), ...overrides,
  })

  it('histórico registra o autor real e não pode ser alterado', async () => {
    const db = fs(USERS.opA.uid)
    await assertFails(setDoc(doc(db, `statusHistory/h1-${run}`), entry({ changedBy: actor('outra-pessoa') })))
    await assertSucceeds(setDoc(doc(db, `statusHistory/h2-${run}`), entry()))
    await assertFails(updateDoc(doc(db, `statusHistory/h2-${run}`), { message: 'alterado' }))
    await assertFails(deleteDoc(doc(fs(USERS.adminA.uid), `statusHistory/h2-${run}`)))
  })

  it('imagem do comprovante tem formato e tamanho limitados', async () => {
    const db = fs(USERS.opA.uid)
    const base = {
      organizationId: ORG_A, orderId: `a-${run}`, routeId: null, stopId: null, driverId: null, recipientName: 'Fulano',
      notes: '', latitude: null, longitude: null, createdBy: actor(USERS.opA.uid), createdAt: serverTimestamp(),
    }
    const big = `data:image/jpeg;base64,${'A'.repeat(500_000)}`
    await assertFails(setDoc(doc(db, `deliveryProofs/big-${run}`), { ...base, imageData: big, imageMimeType: 'image/jpeg', imageBytes: big.length }))
    await assertFails(
      setDoc(doc(db, `deliveryProofs/gif-${run}`), { ...base, imageData: 'data:image/gif;base64,AAAA', imageMimeType: 'image/gif', imageBytes: 10 }),
    )
    await assertSucceeds(
      setDoc(doc(db, `deliveryProofs/ok-${run}`), { ...base, imageData: 'data:image/webp;base64,AAAA', imageMimeType: 'image/webp', imageBytes: 28 }),
    )
    // Depois de criada, a foto não pode ser trocada por outra
    await assertFails(updateDoc(doc(db, `deliveryProofs/ok-${run}`), { imageData: 'data:image/webp;base64,BBBB' }))
  })

  it('localização só com rota em andamento do mesmo motorista', async () => {
    const db = fs(USERS.opA.uid)
    const point = (routeId: string, driverId = 'drv-1') => ({
      organizationId: ORG_A, routeId, driverId, lat: -19.9, lng: -43.9, accuracy: 10, recordedAt: serverTimestamp(),
    })
    await seed(`routes/draft-${run}`, { ...routeData(ORG_A, { status: 'ASSIGNED' }), createdAt: new Date(), updatedAt: new Date() })
    await seed(`routes/live-${run}`, { ...routeData(ORG_A), createdAt: new Date(), updatedAt: new Date() })
    await assertFails(setDoc(doc(db, `locationHistory/l1-${run}`), point(`draft-${run}`)))
    await assertFails(setDoc(doc(db, `locationHistory/l2-${run}`), point(`live-${run}`, 'outro-motorista')))
    await assertSucceeds(setDoc(doc(db, `locationHistory/l3-${run}`), point(`live-${run}`)))
    await assertFails(deleteDoc(doc(db, `locationHistory/l3-${run}`)))
  })
})
