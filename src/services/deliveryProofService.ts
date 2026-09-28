import { getDoc, runTransaction, type Transaction } from 'firebase/firestore'
import { db } from '@/firebase/app'
import { COL, docRef, newDocRef, reviveDates } from '@/firebase/collections'
import type { DeliveryProof, GeoPoint, Order, ProofSummary } from '@/types/domain'
import type { ProcessedImage } from '@/utils/compressImage'
import { assertSameOrg, DomainError, requireAdmin, requireStaff, stamp, writeHistory, type SessionContext } from './context'

/**
 * Único ponto que conhece como o comprovante é armazenado.
 * Hoje: documento do Firestore com a imagem em base64 (imageData).
 * Para mudar a estratégia (ex.: object storage), altere só este arquivo.
 *
 * Regras do MVP: uma foto por entrega, já comprimida por compressImage().
 */

export interface ProofInput {
  orderId: string
  routeId: string | null
  stopId: string | null
  driverId: string | null
  recipientName: string
  notes: string
  image: ProcessedImage | null
  location: GeoPoint | null
}

function imageFields(image: ProcessedImage | null) {
  return {
    imageData: image?.dataUrl ?? null,
    imageMimeType: image?.mimeType ?? null,
    imageBytes: image?.bytes ?? null,
  }
}

export const deliveryProofService = {
  /** Grava o comprovante dentro da transação da entrega. Devolve o resumo para o pedido. */
  save(tx: Transaction, ctx: SessionContext, input: ProofInput): Omit<ProofSummary, 'deliveredAt'> {
    requireStaff(ctx)
    const recipientName = input.recipientName.trim()
    if (!recipientName) throw new DomainError('Informe o nome de quem recebeu.')
    const ref = newDocRef(COL.deliveryProofs)
    tx.set(ref, {
      organizationId: ctx.organizationId,
      orderId: input.orderId,
      routeId: input.routeId,
      stopId: input.stopId,
      driverId: input.driverId,
      recipientName,
      notes: input.notes.trim(),
      ...imageFields(input.image),
      latitude: input.location?.lat ?? null,
      longitude: input.location?.lng ?? null,
      createdBy: ctx.actor,
      createdAt: stamp(),
    })
    return { id: ref.id, recipientName, hasImage: Boolean(input.image) }
  },

  /** Carrega o comprovante completo (com imagem). Use só ao abrir a visualização. */
  async get(ctx: SessionContext, proofId: string): Promise<DeliveryProof> {
    const snap = await getDoc(docRef(COL.deliveryProofs, proofId))
    const data = snap.data()
    assertSameOrg(ctx, data)
    return reviveDates<DeliveryProof>({ id: snap.id, ...data })
  },

  /** Anexa a foto a um comprovante registrado sem imagem. */
  async attachImage(ctx: SessionContext, orderId: string, image: ProcessedImage) {
    requireStaff(ctx)
    const orderRef = docRef(COL.orders, orderId)
    await runTransaction(db, async (tx) => {
      const order = (await tx.get(orderRef)).data() as Order | undefined
      assertSameOrg(ctx, order)
      if (order!.status !== 'DELIVERED' || !order!.proof)
        throw new DomainError('Registre a entrega antes de anexar a foto.')
      if (order!.proof.hasImage) throw new DomainError('Este comprovante já tem foto.')
      tx.update(docRef(COL.deliveryProofs, order!.proof.id), imageFields(image))
      tx.update(orderRef, { 'proof.hasImage': true, updatedAt: stamp() })
      writeHistory(tx, ctx, {
        event: 'PROOF_REGISTERED',
        orderId,
        routeId: order!.routeId,
        message: 'Foto do comprovante anexada',
      })
    })
  },

  /** Remove a foto do comprovante (somente administradores). O registro da entrega permanece. */
  async deleteImage(ctx: SessionContext, orderId: string, reason: string) {
    requireAdmin(ctx)
    if (!reason.trim()) throw new DomainError('Informe o motivo da remoção.')
    const orderRef = docRef(COL.orders, orderId)
    await runTransaction(db, async (tx) => {
      const order = (await tx.get(orderRef)).data() as Order | undefined
      assertSameOrg(ctx, order)
      if (!order!.proof?.hasImage) throw new DomainError('Este comprovante não tem foto.')
      tx.update(docRef(COL.deliveryProofs, order!.proof.id), imageFields(null))
      tx.update(orderRef, { 'proof.hasImage': false, updatedAt: stamp() })
      writeHistory(tx, ctx, {
        event: 'PROOF_REGISTERED',
        orderId,
        routeId: order!.routeId,
        message: `Foto do comprovante removida: ${reason.trim()}`,
      })
    })
  },
}
