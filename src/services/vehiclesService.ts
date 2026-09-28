import { addDoc, query, updateDoc, where } from 'firebase/firestore'
import { COL, colRef, docRef } from '@/firebase/collections'
import type { ActiveStatus, Vehicle, VehicleType } from '@/types/domain'
import { isValidPlate, normalizePlate } from '@/utils/format'
import { DomainError, requireStaff, stamp, type SessionContext } from './context'
import { listen } from './subscribe'

export interface VehicleInput {
  plate: string
  model: string
  type: VehicleType
  capacityKg: number | null
  capacityVolumes: number | null
}

/** existingPlates: placas já cadastradas na organização, exceto a do próprio veículo. */
export function validateVehicleInput(input: VehicleInput, existingPlates: string[] = []): Record<string, string> {
  const errors: Record<string, string> = {}
  const plate = normalizePlate(input.plate)
  if (!isValidPlate(plate)) errors.plate = 'Placa inválida. Use o padrão ABC1D23 ou ABC1234.'
  else if (existingPlates.includes(plate)) errors.plate = 'Já existe um veículo com esta placa.'
  if (!input.model.trim()) errors.model = 'Informe o modelo.'
  if (input.capacityKg != null && (input.capacityKg <= 0 || input.capacityKg > 30000))
    errors.capacityKg = 'Capacidade entre 1 e 30.000 kg.'
  if (input.capacityVolumes != null && (input.capacityVolumes <= 0 || input.capacityVolumes > 5000))
    errors.capacityVolumes = 'Volumes entre 1 e 5.000.'
  return errors
}

function clean(input: VehicleInput, existingPlates: string[]) {
  const first = Object.values(validateVehicleInput(input, existingPlates))[0]
  if (first) throw new DomainError(first)
  return {
    plate: normalizePlate(input.plate),
    model: input.model.trim(),
    type: input.type,
    capacityKg: input.capacityKg,
    capacityVolumes: input.capacityVolumes,
  }
}

export const vehiclesService = {
  subscribe(organizationId: string, onData: (items: Vehicle[]) => void, onError: (e: Error) => void) {
    return listen<Vehicle>(query(colRef(COL.vehicles), where('organizationId', '==', organizationId)), onData, onError)
  },

  async create(ctx: SessionContext, input: VehicleInput, existingPlates: string[]) {
    requireStaff(ctx)
    const ref = await addDoc(colRef(COL.vehicles), {
      ...clean(input, existingPlates),
      organizationId: ctx.organizationId,
      status: 'ACTIVE',
      createdAt: stamp(),
      updatedAt: stamp(),
    })
    return ref.id
  },

  async update(ctx: SessionContext, id: string, input: VehicleInput, existingPlates: string[]) {
    requireStaff(ctx)
    await updateDoc(docRef(COL.vehicles, id), { ...clean(input, existingPlates), updatedAt: stamp() })
  },

  async setStatus(ctx: SessionContext, id: string, status: ActiveStatus) {
    requireStaff(ctx)
    await updateDoc(docRef(COL.vehicles, id), { status, updatedAt: stamp() })
  },
}
