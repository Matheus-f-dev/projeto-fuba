/**
 * Provisiona uma organização com dados de demonstração (fictícios).
 *
 * Emulador (recomendado):
 *   npm run emulators            # em um terminal
 *   npm run seed:emulator        # em outro
 *
 * Projeto real (cria a organização e o primeiro administrador):
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
 *   npx tsx scripts/seed.ts --project SEU_PROJETO --confirm \
 *     --admin-email voce@empresa.com --admin-password 'SenhaForte123' --admin-name "Seu Nome" [--no-demo]
 *
 * Opções: --reset apaga os dados da organização antes de recriar.
 * Nenhum dado pessoal real é usado: nomes, telefones e placas são inventados.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp, type DocumentData, type WriteBatch } from 'firebase-admin/firestore'
import { crc32, deflateSync } from 'node:zlib'

// ——— Argumentos ————————————————————————————————————————————————

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(`--${name}`)
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const projectId = opt('project', process.env.GCLOUD_PROJECT ?? 'demo-fuba')
const orgId = opt('org-id', 'demo-org')
const orgName = opt('org-name', 'Expresso Serra Azul Logística')
const adminEmail = opt('admin-email', 'admin@demo.fuba')
const adminPassword = opt('admin-password', 'demo1234')
const adminName = opt('admin-name', 'Marina Couto')
const withDemo = !flag('no-demo')
// Senha dos usuários de demonstração (operador e motorista); padrão: a mesma do administrador
const demoPassword = opt('demo-password', adminPassword)

if (!usingEmulator && !flag('confirm')) {
  console.error('Sem FIRESTORE_EMULATOR_HOST: isto grava no projeto real. Repita com --confirm para continuar.')
  process.exit(1)
}

initializeApp(usingEmulator ? { projectId } : { projectId, credential: applicationDefault() })
const db = getFirestore()
const auth = getAuth()

// ——— Utilidades ————————————————————————————————————————————————

const ts = (d: Date) => Timestamp.fromDate(d)
const now = new Date()
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const today = iso(now)
const yesterdayDate = new Date(now.getTime() - 86400000)
const yesterday = iso(yesterdayDate)
const tomorrow = iso(new Date(now.getTime() + 86400000))

/** Horário de hoje (ou de outro dia) em HH:mm, limitado ao "agora" para não criar eventos no futuro. */
function at(time: string, base: Date = now) {
  const [h, m] = time.split(':').map(Number)
  const d = new Date(base)
  d.setHours(h, m, 0, 0)
  return d > now ? new Date(now.getTime() - 60000) : d
}

let rand = 42
const random = () => ((rand = (rand * 16807) % 2147483647) - 1) / 2147483646

/** Grava em lotes de até 400 operações. */
class Writer {
  private batch: WriteBatch = db.batch()
  private count = 0
  private pending: Promise<unknown>[] = []
  set(path: string, data: DocumentData) {
    this.batch.set(db.doc(path), data)
    if (++this.count >= 400) this.flush()
  }
  flush() {
    if (this.count === 0) return
    this.pending.push(this.batch.commit())
    this.batch = db.batch()
    this.count = 0
  }
  async done() {
    this.flush()
    await Promise.all(this.pending)
  }
}

/** PNG sintético (sem dependências) para simular a foto do comprovante. */
function fakeProofPng(label: number): string {
  const w = 320
  const h = 240
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    for (let x = 0; x < w; x++) {
      const i = y * (w * 3 + 1) + 1 + x * 3
      const inBox = x > 90 && x < 230 && y > 70 && y < 190
      const tape = inBox && Math.abs(x - 160) < 8
      const shade = 200 + Math.round((y / h) * 30) - (label % 5) * 4
      const [r, g, b] = tape ? [214, 190, 140] : inBox ? [176, 132, 84] : [shade, shade - 4, shade - 10]
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
  return `data:image/png;base64,${png.toString('base64')}`
}

// ——— Dados fictícios ————————————————————————————————————————————

const DRIVERS = [
  { key: 'carlos', name: 'Carlos Henrique Duarte', phone: '31990010001', license: '04512398761', cat: 'B' },
  { key: 'joao', name: 'João Batista Reis', phone: '31990010002', license: '05598712340', cat: 'AB' },
  { key: 'luana', name: 'Luana Moreira Campos', phone: '31990010003', license: '06123487905', cat: 'B' },
  { key: 'rafael', name: 'Rafael Antunes Prado', phone: '31990010004', license: '03321456987', cat: 'D' },
  { key: 'patricia', name: 'Patrícia Nogueira Lins', phone: '31990010005', license: '07765123409', cat: 'B' },
]

const VEHICLES = [
  { key: 'fiorino', plate: 'RTA2B41', model: 'Fiat Fiorino Endurance', type: 'UTILITARIO', kg: 650, vol: 60 },
  { key: 'kangoo', plate: 'QXZ8C17', model: 'Renault Kangoo Express', type: 'UTILITARIO', kg: 800, vol: 80 },
  { key: 'sprinter', plate: 'SBD4E09', model: 'Mercedes-Benz Sprinter 416', type: 'VAN', kg: 1500, vol: 180 },
  { key: 'strada', plate: 'PWM1F32', model: 'Fiat Strada Freedom', type: 'CARRO', kg: 720, vol: 40 },
  { key: 'cg', plate: 'OPL7A55', model: 'Honda CG 160 Cargo', type: 'MOTO', kg: 20, vol: 4 },
]

// Endereços genéricos em bairros de BH e região, com coordenadas aproximadas do bairro
const PLACES = [
  { street: 'Rua dos Timbiras', district: 'Funcionários', city: 'Belo Horizonte', zip: '30140060', lat: -19.9335, lng: -43.9361 },
  { street: 'Av. do Contorno', district: 'Santa Efigênia', city: 'Belo Horizonte', zip: '30110070', lat: -19.9239, lng: -43.9217 },
  { street: 'Rua Pernambuco', district: 'Savassi', city: 'Belo Horizonte', zip: '30130150', lat: -19.9375, lng: -43.9338 },
  { street: 'Rua Grão Mogol', district: 'Sion', city: 'Belo Horizonte', zip: '30315010', lat: -19.9531, lng: -43.9335 },
  { street: 'Av. Amazonas', district: 'Prado', city: 'Belo Horizonte', zip: '30411000', lat: -19.9282, lng: -43.9601 },
  { street: 'Rua Itapeva', district: 'Padre Eustáquio', city: 'Belo Horizonte', zip: '30720360', lat: -19.9086, lng: -43.9763 },
  { street: 'Rua Jacuí', district: 'Floresta', city: 'Belo Horizonte', zip: '31110050', lat: -19.9121, lng: -43.9267 },
  { street: 'Av. Cristiano Machado', district: 'Cidade Nova', city: 'Belo Horizonte', zip: '31170800', lat: -19.8857, lng: -43.9269 },
  { street: 'Rua Pouso Alegre', district: 'Santa Tereza', city: 'Belo Horizonte', zip: '31015030', lat: -19.9148, lng: -43.9153 },
  { street: 'Av. Portugal', district: 'Santa Amélia', city: 'Belo Horizonte', zip: '31555000', lat: -19.8469, lng: -43.9688 },
  { street: 'Rua Flor de Maio', district: 'Castelo', city: 'Belo Horizonte', zip: '31330150', lat: -19.8828, lng: -44.0017 },
  { street: 'Av. Nossa Senhora do Carmo', district: 'Carmo', city: 'Belo Horizonte', zip: '30310000', lat: -19.9463, lng: -43.9310 },
  { street: 'Rua Rio Comprido', district: 'Cinquentenário', city: 'Belo Horizonte', zip: '30570010', lat: -19.9603, lng: -43.9937 },
  { street: 'Av. João César de Oliveira', district: 'Eldorado', city: 'Contagem', zip: '32315000', lat: -19.9365, lng: -44.0445 },
  { street: 'Rua Tiradentes', district: 'Centro', city: 'Contagem', zip: '32041000', lat: -19.9170, lng: -44.0803 },
  { street: 'Av. Babita Camargos', district: 'Cidade Industrial', city: 'Contagem', zip: '32210180', lat: -19.9510, lng: -44.0206 },
  { street: 'Rua do Rosário', district: 'Angola', city: 'Betim', zip: '32604115', lat: -19.9608, lng: -44.1901 },
  { street: 'Av. Governador Valadares', district: 'Centro', city: 'Betim', zip: '32600222', lat: -19.9679, lng: -44.1985 },
  { street: 'Rua Padre Pedro Pinto', district: 'Venda Nova', city: 'Belo Horizonte', zip: '31510000', lat: -19.8147, lng: -43.9554 },
  { street: 'Av. Afonso Pena', district: 'Mangabeiras', city: 'Belo Horizonte', zip: '30315270', lat: -19.9489, lng: -43.9212 },
  { street: 'Rua Coronel Pedro Paulo Penido', district: 'Nova Lima Centro', city: 'Nova Lima', zip: '34000000', lat: -19.9858, lng: -43.8468 },
  { street: 'Al. Oscar Niemeyer', district: 'Vila da Serra', city: 'Nova Lima', zip: '34006056', lat: -19.9731, lng: -43.9431 },
  { street: 'Rua Caraça', district: 'Serra', city: 'Belo Horizonte', zip: '30220260', lat: -19.9398, lng: -43.9189 },
  { street: 'Av. Silviano Brandão', district: 'Horto', city: 'Belo Horizonte', zip: '31015000', lat: -19.9072, lng: -43.9197 },
]

const RECIPIENTS = [
  'Ana Clara Vieira', 'Bruno Tavares', 'Camila Rezende', 'Daniel Fontes', 'Elaine Guimarães', 'Fábio Monteiro',
  'Gabriela Siqueira', 'Heitor Ramalho', 'Isabela Couto', 'Jorge Albuquerque', 'Karina Leal', 'Leonardo Pires',
  'Mariana Freitas', 'Nelson Carvalho', 'Olívia Machado', 'Paulo Sérgio Lemos', 'Quésia Andrade', 'Renato Barros',
  'Sabrina Teles', 'Tiago Moura', 'Úrsula Brandão', 'Vinícius Rocha', 'Wesley Farias', 'Yasmin Cardoso',
]

// ——— Execução ——————————————————————————————————————————————————

async function ensureUser(email: string, password: string, displayName: string) {
  try {
    const existing = await auth.getUserByEmail(email)
    return existing.uid
  } catch {
    const created = await auth.createUser({ email, password, displayName })
    return created.uid
  }
}

async function resetOrg() {
  const collections = ['orders', 'routes', 'routeStops', 'drivers', 'vehicles', 'deliveryProofs', 'occurrences', 'locationHistory', 'statusHistory', 'users']
  for (const name of collections) {
    const snap = await db.collection(name).where('organizationId', '==', orgId).get()
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db.batch()
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }
    if (snap.size) console.log(`  ${name}: ${snap.size} apagados`)
  }
  await db.doc(`organizations/${orgId}`).delete()
}

async function main() {
  console.log(`Projeto: ${projectId}${usingEmulator ? ' (emulador)' : ''} · organização: ${orgId}`)
  const orgRef = db.doc(`organizations/${orgId}`)
  if ((await orgRef.get()).exists) {
    if (!flag('reset')) {
      console.log('A organização já existe. Use --reset para recriar os dados.')
      return
    }
    console.log('Apagando dados anteriores…')
    await resetOrg()
  }

  const w = new Writer()
  const created = ts(at('07:00'))
  const adminUid = await ensureUser(adminEmail, adminPassword, adminName)
  const admin = { uid: adminUid, name: adminName }

  w.set(`users/${adminUid}`, {
    organizationId: orgId, name: adminName, email: adminEmail, phone: '', role: 'ADMIN', status: 'ACTIVE',
    createdAt: created, updatedAt: created,
  })

  if (!withDemo) {
    w.set(`organizations/${orgId}`, { name: orgName, document: '', status: 'ACTIVE', orderSeq: 0, routeSeq: 0, createdAt: created, updatedAt: created })
    await w.done()
    console.log(`Organização criada. Acesso: ${adminEmail}`)
    return
  }

  const operatorUid = await ensureUser('operador@demo.fuba', demoPassword, 'Diego Lima')
  const operator = { uid: operatorUid, name: 'Diego Lima' }
  w.set(`users/${operatorUid}`, {
    organizationId: orgId, name: operator.name, email: 'operador@demo.fuba', phone: '31990020001', role: 'OPERATOR', status: 'ACTIVE',
    createdAt: created, updatedAt: created,
  })
  const driverUserUid = await ensureUser('motorista@demo.fuba', demoPassword, DRIVERS[0].name)
  w.set(`users/${driverUserUid}`, {
    organizationId: orgId, name: DRIVERS[0].name, email: 'motorista@demo.fuba', phone: DRIVERS[0].phone, role: 'DRIVER', status: 'ACTIVE',
    createdAt: created, updatedAt: created,
  })

  const driverId: Record<string, string> = {}
  DRIVERS.forEach((d, i) => {
    const id = `drv-${d.key}`
    driverId[d.key] = id
    w.set(`drivers/${id}`, {
      organizationId: orgId, userId: i === 0 ? driverUserUid : null, name: d.name, phone: d.phone, document: '',
      license: d.license, licenseCategory: d.cat, status: 'ACTIVE', createdAt: created, updatedAt: created,
    })
  })
  const vehicleId: Record<string, string> = {}
  VEHICLES.forEach((v) => {
    const id = `veh-${v.key}`
    vehicleId[v.key] = id
    w.set(`vehicles/${id}`, {
      organizationId: orgId, plate: v.plate, model: v.model, type: v.type, capacityKg: v.kg, capacityVolumes: v.vol,
      status: 'ACTIVE', createdAt: created, updatedAt: created,
    })
  })

  // Pedidos
  type SeedOrder = { id: string; number: string; place: (typeof PLACES)[number]; recipient: string; date: string; createdAt: Date }
  const orders: SeedOrder[] = PLACES.map((place, i) => ({
    id: `ord-${String(i + 1).padStart(3, '0')}`,
    number: `PED-${String(i + 1).padStart(4, '0')}`,
    place,
    recipient: RECIPIENTS[i],
    date: i < 4 ? yesterday : i >= 21 ? tomorrow : today,
    createdAt: i < 4 ? at('16:30', new Date(yesterdayDate.getTime() - 86400000)) : at(`0${6 + (i % 3)}:${String(10 + i).padStart(2, '0')}`),
  }))

  const history = (data: {
    event: string; message: string; at: Date; orderId?: string; routeId?: string; prev?: string | null; next?: string | null; by?: { uid: string; name: string }
  }) => {
    w.set(`statusHistory/h-${Math.random().toString(36).slice(2, 12)}`, {
      organizationId: orgId, event: data.event, message: data.message, orderId: data.orderId ?? null, routeId: data.routeId ?? null,
      previousStatus: data.prev ?? null, newStatus: data.next ?? null, changedBy: data.by ?? operator, createdAt: ts(data.at),
    })
  }

  const orderDoc = new Map<string, DocumentData>()
  for (const o of orders) {
    const withWindow = random() > 0.55
    const startH = 8 + Math.floor(random() * 6)
    orderDoc.set(o.id, {
      organizationId: orgId,
      number: o.number,
      reference: random() > 0.4 ? `NF ${18000 + Math.floor(random() * 900)}` : '',
      notes: '',
      recipient: { name: o.recipient, phone: `3198${String(1000000 + Math.floor(random() * 8999999)).slice(0, 7)}` },
      address: {
        zipCode: o.place.zip, street: o.place.street, number: String(20 + Math.floor(random() * 1800)),
        complement: random() > 0.7 ? `Apto ${100 + Math.floor(random() * 900)}` : '', district: o.place.district,
        city: o.place.city, state: 'MG',
      },
      location: { lat: o.place.lat + (random() - 0.5) * 0.004, lng: o.place.lng + (random() - 0.5) * 0.004 },
      scheduledDate: o.date,
      timeWindow: withWindow ? { start: `${String(startH).padStart(2, '0')}:00`, end: `${String(startH + 3).padStart(2, '0')}:00` } : null,
      deliveryNotes: random() > 0.75 ? 'Entregar na portaria' : '',
      status: 'CREATED', routeId: null, stopId: null, routeSequence: null, driverId: null, vehicleId: null,
      attempts: 0, proof: null, deliveredAt: null,
      createdBy: operator, createdAt: ts(o.createdAt), updatedAt: ts(o.createdAt),
    })
    history({ event: 'ORDER_CREATED', message: `Pedido ${o.number} criado`, at: o.createdAt, orderId: o.id, next: 'CREATED' })
  }

  // Rotas: [código, data, motorista, veículo, pedidos, status, saída, resultados por parada]
  type StopResult = 'DELIVERED' | 'FAILED' | 'ARRIVED' | 'PENDING'
  const ROUTES: {
    code: string; date: string; base: Date; driver: string; vehicle: string; orders: number[]; status: string;
    start: string | null; results: StopResult[]; finish?: string
  }[] = [
    { code: 'R-001', date: yesterday, base: yesterdayDate, driver: 'rafael', vehicle: 'sprinter', orders: [0, 1, 2, 3], status: 'COMPLETED', start: '08:05', finish: '13:40', results: ['DELIVERED', 'DELIVERED', 'FAILED', 'DELIVERED'] },
    { code: 'R-002', date: today, base: now, driver: 'carlos', vehicle: 'fiorino', orders: [4, 5, 6, 7, 8, 9], status: 'IN_PROGRESS', start: '08:10', results: ['DELIVERED', 'DELIVERED', 'FAILED', 'DELIVERED', 'ARRIVED', 'PENDING'] },
    { code: 'R-003', date: today, base: now, driver: 'joao', vehicle: 'kangoo', orders: [10, 11, 12, 13], status: 'IN_PROGRESS', start: '08:40', results: ['DELIVERED', 'PENDING', 'PENDING', 'PENDING'] },
    { code: 'R-004', date: today, base: now, driver: 'luana', vehicle: 'strada', orders: [15, 16, 17], status: 'ASSIGNED', start: null, results: ['PENDING', 'PENDING', 'PENDING'] },
  ]

  let proofSeq = 0
  for (const [ri, r] of ROUTES.entries()) {
    const routeId = `rt-${r.code.toLowerCase()}`
    const plannedAt = at('07:30', r.base)
    const startedAt = r.start ? at(r.start, r.base) : null
    let delivered = 0
    let failed = 0
    let lastLocation: DocumentData | null = null
    let clock = startedAt ? new Date(startedAt) : null

    history({ event: 'ROUTE_CREATED', message: `Rota ${r.code} criada com ${r.orders.length} parada(s)`, at: plannedAt, routeId, next: 'ASSIGNED' })

    r.orders.forEach((oi, idx) => {
      const o = orders[oi]
      const doc = orderDoc.get(o.id)!
      const stopId = `${routeId}-s${idx + 1}`
      const result = r.results[idx]
      const stop: DocumentData = {
        organizationId: orgId, routeId, orderId: o.id, sequence: idx + 1, status: 'PENDING', arrivedAt: null, completedAt: null,
        failureReason: null, occurrenceId: null, proofId: null, notes: '', createdAt: ts(plannedAt), updatedAt: ts(plannedAt),
      }
      Object.assign(doc, {
        status: 'ASSIGNED', routeId, stopId, routeSequence: idx + 1, driverId: driverId[r.driver], vehicleId: vehicleId[r.vehicle],
        scheduledDate: r.date, updatedAt: ts(plannedAt),
      })
      history({ event: 'ADDED_TO_ROUTE', message: `Adicionado à rota ${r.code} como parada ${idx + 1}`, at: plannedAt, orderId: o.id, routeId, prev: 'CREATED', next: 'PLANNED' })
      history({ event: 'DRIVER_ASSIGNED', message: 'Motorista e veículo atribuídos', at: new Date(plannedAt.getTime() + 60000), orderId: o.id, routeId, prev: 'PLANNED', next: 'ASSIGNED' })

      if (startedAt) {
        doc.status = 'IN_TRANSIT'
        history({ event: 'ROUTE_STARTED', message: `Saiu para entrega na rota ${r.code}`, at: startedAt, orderId: o.id, routeId, prev: 'ASSIGNED', next: 'IN_TRANSIT', by: { uid: driverUserUid, name: DRIVERS.find((d) => d.key === r.driver)!.name } })
      }
      if (result !== 'PENDING' && clock) {
        clock = new Date(Math.min(clock.getTime() + (25 + random() * 20) * 60000, now.getTime() - (r.orders.length - idx) * 60000))
        const arrivedAt = clock
        stop.arrivedAt = ts(arrivedAt)
        stop.status = 'ARRIVED'
        history({ event: 'STOP_ARRIVED', message: `Motorista chegou ao destino (parada ${idx + 1})`, at: arrivedAt, orderId: o.id, routeId })
        lastLocation = { lat: doc.location.lat + 0.0004, lng: doc.location.lng - 0.0003, accuracy: 9, recordedAt: ts(arrivedAt) }
        const doneAt = new Date(arrivedAt.getTime() + 6 * 60000 > now.getTime() ? now.getTime() - 30000 : arrivedAt.getTime() + 6 * 60000)

        if (result === 'DELIVERED') {
          const proofId = `prf-${++proofSeq}`
          const receivedBy = random() > 0.6 ? 'Porteiro Sr. Antônio' : doc.recipient.name
          const image = fakeProofPng(proofSeq)
          w.set(`deliveryProofs/${proofId}`, {
            organizationId: orgId, orderId: o.id, routeId, stopId, driverId: driverId[r.driver], recipientName: receivedBy,
            notes: receivedBy === doc.recipient.name ? '' : 'Entregue na portaria', imageData: image, imageMimeType: 'image/png',
            imageBytes: image.length, latitude: doc.location.lat, longitude: doc.location.lng, createdBy: operator, createdAt: ts(doneAt),
          })
          Object.assign(stop, { status: 'DELIVERED', completedAt: ts(doneAt), proofId })
          Object.assign(doc, {
            status: 'DELIVERED', deliveredAt: ts(doneAt), proof: { id: proofId, recipientName: receivedBy, hasImage: true, deliveredAt: ts(doneAt) },
          })
          delivered++
          history({ event: 'DELIVERED', message: `Entrega realizada. Recebido por ${receivedBy}`, at: doneAt, orderId: o.id, routeId, prev: 'IN_TRANSIT', next: 'DELIVERED' })
          history({ event: 'PROOF_REGISTERED', message: 'Comprovante registrado com foto', at: doneAt, orderId: o.id, routeId })
        } else if (result === 'FAILED') {
          const occId = `occ-${routeId}-${idx + 1}`
          const type = ri === 0 ? 'ENDERECO_NAO_LOCALIZADO' : 'DESTINATARIO_AUSENTE'
          w.set(`occurrences/${occId}`, {
            organizationId: orgId, type, status: 'OPEN',
            description: type === 'DESTINATARIO_AUSENTE' ? 'Ninguém atendeu no local. Duas ligações sem resposta.' : 'Número informado não existe na rua. Cliente não atendeu.',
            orderId: o.id, routeId, stopId, driverId: driverId[r.driver], createdBy: operator, createdAt: ts(doneAt),
            resolvedAt: null, resolvedBy: null, resolution: '',
          })
          Object.assign(stop, { status: 'FAILED', completedAt: ts(doneAt), failureReason: type, occurrenceId: occId })
          Object.assign(doc, { status: 'FAILED', attempts: 1 })
          failed++
          history({ event: 'DELIVERY_FAILED', message: `Entrega não realizada: ${type === 'DESTINATARIO_AUSENTE' ? 'Destinatário ausente' : 'Endereço não localizado'}`, at: doneAt, orderId: o.id, routeId, prev: 'IN_TRANSIT', next: 'FAILED' })
        }
        clock = doneAt
      }
      doc.updatedAt = ts(clock ?? plannedAt)
      w.set(`routeStops/${stopId}`, stop)
    })

    // Trajeto (somente rotas em andamento)
    if (r.status === 'IN_PROGRESS' && startedAt) {
      const first = orderDoc.get(orders[r.orders[0]].id)!.location
      const lastPoint = lastLocation ?? { lat: first.lat - 0.01, lng: first.lng - 0.01 }
      const points = 10
      const origin = { lat: first.lat - 0.02, lng: first.lng - 0.015 }
      const span = now.getTime() - startedAt.getTime()
      for (let p = 0; p <= points; p++) {
        const f = p / points
        const recordedAt = new Date(startedAt.getTime() + span * f * 0.97)
        w.set(`locationHistory/loc-${routeId}-${p}`, {
          organizationId: orgId, routeId, driverId: driverId[r.driver],
          lat: origin.lat + (lastPoint.lat - origin.lat) * f + (random() - 0.5) * 0.002,
          lng: origin.lng + (lastPoint.lng - origin.lng) * f + (random() - 0.5) * 0.002,
          accuracy: 8 + Math.round(random() * 10), recordedAt: ts(recordedAt),
        })
      }
      lastLocation = { lat: lastPoint.lat, lng: lastPoint.lng, accuracy: 10, recordedAt: ts(new Date(now.getTime() - 90_000)) }
    }

    if (startedAt) history({ event: 'ROUTE_STARTED', message: `Rota ${r.code} iniciada`, at: startedAt, routeId, prev: 'ASSIGNED', next: 'IN_PROGRESS' })
    const finishedAt = r.finish ? at(r.finish, r.base) : null
    if (finishedAt) history({ event: 'ROUTE_COMPLETED', message: `Rota ${r.code} finalizada: ${delivered} entregue(s), ${failed} não entregue(s)`, at: finishedAt, routeId, prev: 'IN_PROGRESS', next: 'COMPLETED' })

    w.set(`routes/${routeId}`, {
      organizationId: orgId, code: r.code, date: r.date, status: r.status, driverId: driverId[r.driver], vehicleId: vehicleId[r.vehicle],
      stopCount: r.orders.length, deliveredCount: delivered, failedCount: failed, plannedStartAt: '08:00',
      startedAt: startedAt ? ts(startedAt) : null, finishedAt: finishedAt ? ts(finishedAt) : null,
      lastLocation: r.status === 'IN_PROGRESS' ? lastLocation : null, notes: '', createdBy: operator,
      createdAt: ts(plannedAt), updatedAt: ts(finishedAt ?? clock ?? plannedAt),
    })
  }

  // Um pedido cancelado e uma ocorrência já resolvida, para compor o histórico
  const cancelled = orderDoc.get(orders[20].id)!
  Object.assign(cancelled, { status: 'CANCELLED', updatedAt: ts(at('09:15')) })
  history({ event: 'ORDER_CANCELLED', message: 'Pedido cancelado: cliente desistiu da compra', at: at('09:15'), orderId: orders[20].id, prev: 'CREATED', next: 'CANCELLED', by: admin })

  w.set('occurrences/occ-veiculo', {
    organizationId: orgId, type: 'VEICULO_PROBLEMA', status: 'RESOLVED', description: 'Pneu furado na Av. Amazonas. Troca feita no local.',
    orderId: null, routeId: 'rt-r-001', stopId: null, driverId: driverId.rafael, createdBy: operator, createdAt: ts(at('10:20', yesterdayDate)),
    resolvedAt: ts(at('10:55', yesterdayDate)), resolvedBy: operator, resolution: 'Motorista seguiu a rota após 30 minutos.',
  })

  for (const [id, data] of orderDoc) w.set(`orders/${id}`, data)
  w.set(`organizations/${orgId}`, {
    name: orgName, document: '12345678000190', status: 'ACTIVE', orderSeq: orders.length, routeSeq: ROUTES.length,
    createdAt: created, updatedAt: created,
  })
  await w.done()

  console.log(`Pronto: ${orders.length} pedidos, ${DRIVERS.length} motoristas, ${VEHICLES.length} veículos, ${ROUTES.length} rotas.`)
  console.log(`Acessos: ${adminEmail} (admin) · operador@demo.fuba (operador) · senha ${usingEmulator ? adminPassword : '(a informada em --admin-password)'}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
