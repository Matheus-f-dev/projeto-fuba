import { Menu } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { OrderSheet } from '@/features/orders/OrderSheet'
import { ProfileDialog } from '@/features/settings/ProfileDialog'
import { OperationDataProvider } from '@/hooks/useOperationData'
import { cn } from '@/utils/cn'
import { IconButton } from '../ui/Button'
import { Sidebar } from './Sidebar'

const COMPACT_KEY = 'fuba:sidebar-compact'

function readCompact() {
  try {
    return localStorage.getItem(COMPACT_KEY) === '1'
  } catch {
    return false
  }
}

export function AppShell() {
  const [compact, setCompact] = useState(readCompact)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setMobileOpen(false), [location.pathname])

  const toggleCompact = () => {
    setCompact((c) => {
      try {
        localStorage.setItem(COMPACT_KEY, c ? '0' : '1')
      } catch {
        /* armazenamento indisponível: preferência vale só nesta sessão */
      }
      return !c
    })
  }

  return (
    <OperationDataProvider>
      <div className="min-h-dvh lg:flex">
        {/* Desktop */}
        <aside
          className={cn(
            'sticky top-0 hidden h-dvh shrink-0 border-r border-line bg-surface transition-[width] duration-200 lg:block',
            compact ? 'w-[68px]' : 'w-[256px]',
          )}
        >
          <Sidebar compact={compact} onToggleCompact={toggleCompact} onOpenProfile={() => setProfileOpen(true)} />
        </aside>

        {/* Mobile / tablet */}
        <div className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur lg:hidden">
          <IconButton label="Abrir menu" onClick={() => setMobileOpen(true)}>
            <Menu className="size-5" />
          </IconButton>
          <span className="font-display text-[15px] font-bold tracking-[-0.03em]">
            fubá<span className="text-accent">.</span>
          </span>
        </div>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 animate-fade-in bg-ink/30" onClick={() => setMobileOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-[272px] animate-sheet-in border-r border-line bg-surface shadow-pop">
              <Sidebar
                compact={false}
                onNavigate={() => setMobileOpen(false)}
                onOpenProfile={() => {
                  setMobileOpen(false)
                  setProfileOpen(true)
                }}
              />
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
      <OrderSheet />
      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </OperationDataProvider>
  )
}

/** Container padrão das páginas (as telas de mapa usam largura total). */
export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8', className)}>{children}</div>
}
