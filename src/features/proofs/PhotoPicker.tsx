import { Camera, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Spinner } from '@/components/ui/Spinner'
import { compressImage, ImageValidationError, type ProcessedImage } from '@/utils/compressImage'

/** Seleciona a foto, comprime no navegador e mostra a prévia do que será gravado. */
export function PhotoPicker({
  value,
  onChange,
}: {
  value: ProcessedImage | null
  onChange: (image: ProcessedImage | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setProcessing(true)
    try {
      onChange(await compressImage(file))
    } catch (e) {
      setError(e instanceof ImageValidationError ? e.message : 'Não foi possível processar a foto.')
      onChange(null)
    } finally {
      setProcessing(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0])}
        aria-label="Foto do comprovante"
      />
      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-line bg-sunken p-2">
          <img src={value.dataUrl} alt="Prévia do comprovante" className="size-16 rounded-md object-cover" />
          <div className="min-w-0 flex-1 text-xs text-muted">
            <p className="font-medium text-ink">Foto pronta</p>
            <p className="tnum">
              {value.width}×{value.height} · {Math.round(value.bytes / 1024)} KB
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-ink/5 hover:text-ink"
            aria-label="Remover foto"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={processing}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong px-4 py-5 text-[13px] font-medium text-ink-2 transition-colors hover:border-accent hover:bg-accent-soft/40 hover:text-accent-ink disabled:cursor-wait"
        >
          {processing ? <Spinner /> : <Camera className="size-4" />}
          {processing ? 'Reduzindo a foto…' : 'Tirar ou escolher foto'}
        </button>
      )}
      <p className={error ? 'mt-1.5 text-xs text-danger' : 'mt-1.5 text-xs text-muted'}>
        {error ?? 'JPEG, PNG ou WEBP. A foto é reduzida antes de ser salva.'}
      </p>
    </div>
  )
}
