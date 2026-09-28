/**
 * Prepara a foto do comprovante para ser gravada no próprio documento do Firestore.
 *
 *   arquivo original → validação → redimensionamento → compressão → data URL base64
 *
 * O documento do Firestore tem limite de 1 MiB. Mantemos a imagem final abaixo de
 * MAX_OUTPUT_BYTES (base64 ~33% maior que o binário), com folga para os demais campos.
 */

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const MAX_INPUT_BYTES = 15 * 1024 * 1024
export const MAX_OUTPUT_BYTES = 450 * 1024 // tamanho do data URL em caracteres (≈ bytes)
const MAX_DIMENSION = 1280
const QUALITY_STEPS = [0.82, 0.72, 0.62, 0.52, 0.42]

export interface ProcessedImage {
  dataUrl: string
  mimeType: 'image/webp' | 'image/jpeg'
  bytes: number
  width: number
  height: number
}

export class ImageValidationError extends Error {}

export function validateImageFile(file: File) {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type))
    throw new ImageValidationError('Formato não aceito. Envie uma foto JPEG, PNG ou WEBP.')
  if (file.size > MAX_INPUT_BYTES)
    throw new ImageValidationError('Arquivo acima de 15 MB. Envie uma foto menor.')
}

function fitWithin(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

function canvasSupportsWebp() {
  const c = document.createElement('canvas')
  c.width = c.height = 1
  return c.toDataURL('image/webp').startsWith('data:image/webp')
}

export async function compressImage(file: File): Promise<ProcessedImage> {
  validateImageFile(file)
  // imageOrientation respeita a rotação EXIF das fotos de celular
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new ImageValidationError('Não foi possível ler a imagem. O arquivo pode estar corrompido.')
  })

  const mimeType = canvasSupportsWebp() ? 'image/webp' : 'image/jpeg'
  let dimension = MAX_DIMENSION

  try {
    // Reduz qualidade e, se preciso, dimensão até caber no limite
    while (dimension >= 480) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, dimension)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')!
      context.fillStyle = '#fff' // PNG com transparência vira fundo branco
      context.fillRect(0, 0, width, height)
      context.drawImage(bitmap, 0, 0, width, height)

      for (const quality of QUALITY_STEPS) {
        const dataUrl = canvas.toDataURL(mimeType, quality)
        if (dataUrl.length <= MAX_OUTPUT_BYTES)
          return { dataUrl, mimeType, bytes: dataUrl.length, width, height }
      }
      dimension = Math.round(dimension * 0.75)
    }
  } finally {
    bitmap.close()
  }
  throw new ImageValidationError('Não foi possível reduzir a foto o suficiente. Tente outra imagem.')
}
