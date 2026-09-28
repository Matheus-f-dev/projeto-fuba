import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useSession } from '@/hooks/useSession'

export function FullScreenLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-muted" aria-busy="true">
      <Spinner className="size-5" />
    </div>
  )
}

/** Usuário autenticado, mas sem acesso ao painel. */
export function AccessBlocked({ title, description }: { title: string; description: string }) {
  const { signOut } = useSession()
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="panel max-w-sm p-6">
        <h1 className="font-display text-lg font-semibold tracking-[-0.02em]">{title}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{description}</p>
        <Button className="mt-5" onClick={() => void signOut()}>
          Sair
        </Button>
      </div>
    </div>
  )
}
