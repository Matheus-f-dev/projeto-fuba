import { FirebaseError } from 'firebase/app'
import { serverTimestamp, type DocumentData, type DocumentReference } from 'firebase/firestore'
import { InvalidTransitionError } from '@/domain/status'
import { COL, newDocRef } from '@/firebase/collections'
import type { ActorRef, HistoryEvent, UserRole } from '@/types/domain'

/** Quem está agindo e em qual organização. Toda escrita recebe este contexto. */
export interface SessionContext {
  organizationId: string
  role: UserRole
  actor: ActorRef
}

/** Erro de regra de negócio, com mensagem pronta para o usuário. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomainError'
  }
}

export function toUserMessage(error: unknown): string {
  if (error instanceof DomainError || error instanceof InvalidTransitionError) return error.message
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'permission-denied':
        return 'Ação não permitida para o seu usuário ou para o estado atual do registro.'
      case 'unavailable':
        return 'Sem conexão com o servidor. A alteração será enviada quando a conexão voltar.'
      case 'not-found':
        return 'Registro não encontrado. Ele pode ter sido removido.'
      case 'failed-precondition':
        return 'O registro mudou enquanto você editava. Atualize a tela e tente de novo.'
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'E-mail ou senha incorretos.'
      case 'auth/too-many-requests':
        return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
      case 'auth/email-already-in-use':
        return 'Já existe um usuário com este e-mail.'
      case 'auth/weak-password':
        return 'A senha precisa ter pelo menos 6 caracteres.'
    }
  }
  console.error(error)
  return 'Não foi possível concluir a ação. Tente de novo.'
}

export function requireStaff(ctx: SessionContext) {
  if (ctx.role !== 'ADMIN' && ctx.role !== 'OPERATOR')
    throw new DomainError('Somente administradores e operadores podem fazer esta alteração.')
}

export function requireAdmin(ctx: SessionContext) {
  if (ctx.role !== 'ADMIN') throw new DomainError('Somente administradores podem fazer esta alteração.')
}

export function assertSameOrg(ctx: SessionContext, data: { organizationId?: unknown } | undefined) {
  if (!data || data.organizationId !== ctx.organizationId)
    throw new DomainError('Registro não encontrado.')
}

interface HistoryInput {
  event: HistoryEvent
  message: string
  orderId?: string | null
  routeId?: string | null
  previousStatus?: string | null
  newStatus?: string | null
}

/** Grava um item de histórico dentro da mesma transação/lote da alteração. */
/** Transaction ou WriteBatch: qualquer um que saiba gravar um documento. */
export interface DocWriter {
  set(ref: DocumentReference, data: DocumentData): unknown
}

export function writeHistory(
  writer: DocWriter,
  ctx: SessionContext,
  input: HistoryInput,
) {
  writer.set(newDocRef(COL.statusHistory), {
    organizationId: ctx.organizationId,
    event: input.event,
    message: input.message,
    orderId: input.orderId ?? null,
    routeId: input.routeId ?? null,
    previousStatus: input.previousStatus ?? null,
    newStatus: input.newStatus ?? null,
    changedBy: ctx.actor,
    createdAt: serverTimestamp(),
  })
}

export const stamp = () => serverTimestamp()
