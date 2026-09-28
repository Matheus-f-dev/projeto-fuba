/**
 * Publica firestore.rules e firestore.indexes.json usando uma conta de serviço,
 * sem precisar de `firebase login` (alternativa a `firebase deploy --only firestore`).
 *
 *   npx tsx scripts/deploy-firestore.ts <chave-da-conta-de-servico.json>
 *
 * Índices já existentes são mantidos; só os que faltam são criados.
 */
import { readFileSync } from 'node:fs'
import { cert, initializeApp } from 'firebase-admin/app'
import { getSecurityRules } from 'firebase-admin/security-rules'

const keyPath = process.argv[2]
if (!keyPath) {
  console.error('Uso: npx tsx scripts/deploy-firestore.ts <chave.json>')
  process.exit(1)
}
const key = JSON.parse(readFileSync(keyPath, 'utf8'))
const credential = cert(key)
const projectId: string = key.project_id
initializeApp({ credential, projectId })

// ——— Regras ————————————————————————————————————————————————————
const ruleset = await getSecurityRules().releaseFirestoreRulesetFromSource(readFileSync('firestore.rules', 'utf8'))
console.log(`Regras publicadas (ruleset ${ruleset.name.split('/').pop()})`)

// ——— Índices ———————————————————————————————————————————————————
const { access_token } = await credential.getAccessToken()
const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups`
const api = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, any>
  return { ok: res.ok, status: res.status, json }
}

type Field = { fieldPath: string; order: 'ASCENDING' | 'DESCENDING' }
const spec = JSON.parse(readFileSync('firestore.indexes.json', 'utf8')) as {
  indexes: { collectionGroup: string; queryScope: string; fields: Field[] }[]
  fieldOverrides: { collectionGroup: string; fieldPath: string; indexes: unknown[] }[]
}
const signature = (fields: Field[]) => fields.map((f) => `${f.fieldPath}:${f.order}`).join(',')

const existing = new Map<string, Set<string>>()
for (const group of new Set(spec.indexes.map((i) => i.collectionGroup))) {
  const res = await api('GET', `${base}/${group}/indexes`)
  if (!res.ok) throw new Error(`Falha ao listar índices de ${group}: ${res.status} ${JSON.stringify(res.json.error ?? res.json)}`)
  const sigs = new Set<string>(
    (res.json.indexes ?? []).map((i: { fields: Field[] }) => signature(i.fields.filter((f) => f.fieldPath !== '__name__'))),
  )
  existing.set(group, sigs)
}

let created = 0
for (const index of spec.indexes) {
  if (existing.get(index.collectionGroup)!.has(signature(index.fields))) continue
  const res = await api('POST', `${base}/${index.collectionGroup}/indexes`, {
    queryScope: index.queryScope,
    fields: index.fields,
  })
  if (!res.ok && res.status !== 409) throw new Error(`Falha ao criar índice ${index.collectionGroup} (${signature(index.fields)}): ${JSON.stringify(res.json.error ?? res.json)}`)
  created++
  console.log(`  índice criado: ${index.collectionGroup} (${index.fields.map((f) => f.fieldPath).join(', ')})`)
}
console.log(created ? `${created} índice(s) em construção (levam alguns minutos).` : 'Todos os índices já existiam.')

// Campos sem indexação (ex.: imagem em base64 do comprovante)
for (const o of spec.fieldOverrides) {
  const res = await api('PATCH', `${base}/${o.collectionGroup}/fields/${o.fieldPath}?updateMask=indexConfig`, {
    indexConfig: { indexes: o.indexes },
  })
  if (!res.ok) throw new Error(`Falha ao configurar ${o.collectionGroup}.${o.fieldPath}: ${JSON.stringify(res.json.error ?? res.json)}`)
  console.log(`  ${o.collectionGroup}.${o.fieldPath}: indexação desativada`)
}
process.exit(0)
