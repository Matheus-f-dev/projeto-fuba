// Diagnóstico somente leitura do projeto real: npx tsx scripts/check-firebase.ts <chave.json>
import { readFileSync } from 'node:fs'
import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const keyPath = process.argv[2]
const key = JSON.parse(readFileSync(keyPath, 'utf8'))
console.log('project_id:', key.project_id)
console.log('client_email:', key.client_email)
initializeApp({ credential: cert(key), projectId: key.project_id })

try {
  const cols = await getFirestore().listCollections()
  console.log('firestore: OK, coleções existentes:', cols.map((c) => c.id).join(', ') || '(nenhuma)')
} catch (e: any) {
  console.log('firestore: ERRO', e.code, String(e.message).split('\n')[0])
}
try {
  const users = await getAuth().listUsers(5)
  console.log('auth: OK, usuários:', users.users.length)
} catch (e: any) {
  console.log('auth: ERRO', e.code, String(e.message).split('\n')[0])
}
// Estado dos índices compostos (CREATING → READY)
try {
  const { access_token } = await cert(key).getAccessToken()
  const groups = [...new Set((JSON.parse(readFileSync('firestore.indexes.json', 'utf8')).indexes as { collectionGroup: string }[]).map((i) => i.collectionGroup))]
  const states: Record<string, number> = {}
  for (const g of groups) {
    const res = await fetch(`https://firestore.googleapis.com/v1/projects/${key.project_id}/databases/(default)/collectionGroups/${g}/indexes`, {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    for (const i of ((await res.json()) as { indexes?: { state: string }[] }).indexes ?? []) states[i.state] = (states[i.state] ?? 0) + 1
  }
  console.log('índices:', Object.entries(states).map(([s, n]) => `${n} ${s}`).join(', ') || '(nenhum)')
} catch (e: any) {
  console.log('índices: ERRO', String(e.message).split('\n')[0])
}
process.exit(0)
