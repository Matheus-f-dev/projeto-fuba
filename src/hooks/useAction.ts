import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { toUserMessage } from '@/services/context'

/**
 * Executa uma operação de escrita com estado de carregamento e feedback.
 * Retorna true quando concluiu, para o chamador fechar diálogos etc.
 */
export function useAction() {
  const [pending, setPending] = useState(false)
  const run = useCallback(async (fn: () => Promise<unknown>, success?: string): Promise<boolean> => {
    setPending(true)
    try {
      await fn()
      if (success) toast.success(success)
      return true
    } catch (error) {
      toast.error(toUserMessage(error))
      return false
    } finally {
      setPending(false)
    }
  }, [])
  return { pending, run }
}
