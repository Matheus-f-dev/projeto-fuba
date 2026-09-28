import {
  Building2,
  IdCard,
  LayoutGrid,
  LogOut,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Radar,
  Route as RouteIcon,
  Settings,
  TriangleAlert,
  Truck,
  UserRound,
  Users,
  Waypoints,
  type LucideIcon,
} from 'lucide-react'
import { NavLink } from 'react-router'
import { ROLE_LABEL } from '@/domain/status'
import { useOperationData } from '@/hooks/useOperationData'
import { useReadySession, useSession } from '@/hooks/useSession'
import { cn } from '@/utils/cn'
import { Avatar } from '../ui/misc'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  badge?: number
  adminOnly?: boolean
}

function Logo({ compact, onToggle }: { compact: boolean; onToggle?: () => void }) {
  return (
    <div className={cn('flex h-14 items-center gap-2.5 px-4', compact && 'flex-col justify-center gap-1 h-auto py-3 px-0')}>
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#14181B" />
        <circle cx="9" cy="22" r="3" fill="#fff" />
        <circle cx="23" cy="10" r="3" fill="#2E4BDB" />
        <path d="M9 22 L9 14 Q9 10 13 10 L23 10" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      </svg>
      {!compact && (
        <span className="font-display text-[17px] font-bold tracking-[-0.03em] text-ink">
          fubá<span className="text-accent">.</span>
        </span>
      )}
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          title={compact ? 'Expandir menu' : 'Recolher menu'}
          aria-label={compact ? 'Expandir menu' : 'Recolher menu'}
          className={cn(
            'inline-flex size-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-ink/[0.05] hover:text-ink',
            !compact && 'ml-auto',
          )}
        >
          {compact ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      )}
    </div>
  )
}

export function Sidebar({
  compact,
  onToggleCompact,
  onNavigate,
  onOpenProfile,
}: {
  compact: boolean
  onToggleCompact?: () => void
  onNavigate?: () => void
  onOpenProfile: () => void
}) {
  const { profile } = useReadySession()
  const { signOut } = useSession()
  const { occurrences, orders } = useOperationData()
  const openOccurrences = occurrences.items.filter((o) => o.status === 'OPEN').length
  const waiting = orders.items.filter((o) => o.status === 'CREATED').length

  const sections: { title?: string; items: NavItem[] }[] = [
    { items: [{ to: '/dashboard', label: 'Visão geral', icon: LayoutGrid }] },
    {
      title: 'Operação',
      items: [
        { to: '/pedidos', label: 'Pedidos', icon: Package },
        { to: '/planejamento', label: 'Planejamento', icon: Waypoints, badge: waiting },
        { to: '/rotas', label: 'Rotas', icon: RouteIcon },
        { to: '/monitoramento', label: 'Monitoramento', icon: Radar },
        { to: '/ocorrencias', label: 'Ocorrências', icon: TriangleAlert, badge: openOccurrences },
      ],
    },
    {
      title: 'Recursos',
      items: [
        { to: '/motoristas', label: 'Motoristas', icon: IdCard },
        { to: '/veiculos', label: 'Veículos', icon: Truck },
      ],
    },
    {
      title: 'Configurações',
      items: [
        { to: '/usuarios', label: 'Usuários', icon: Users, adminOnly: true },
        { to: '/organizacao', label: 'Organização', icon: Building2 },
      ],
    },
  ]

  return (
    <nav className="flex h-full flex-col" aria-label="Navegação principal">
      <Logo compact={compact} onToggle={onToggleCompact} />
      <div className="flex-1 overflow-y-auto px-2.5 pt-2 pb-4">
        {sections.map((section, i) => (
          <div key={i} className={cn(i > 0 && 'mt-5')}>
            {section.title &&
              (compact ? (
                <div className="mx-2 mb-2 border-t border-line" />
              ) : (
                <p className="eyebrow mb-1.5 px-2.5">{section.title}</p>
              ))}
            <ul className="space-y-px">
              {section.items
                .filter((item) => !item.adminOnly || profile.role === 'ADMIN')
                .map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={onNavigate}
                      title={compact ? item.label : undefined}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium transition-colors',
                          isActive ? 'bg-ink/[0.06] text-ink' : 'text-ink-2 hover:bg-ink/[0.04] hover:text-ink',
                          compact && 'justify-center px-0',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && <span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-accent" />}
                          <item.icon className={cn('size-4 shrink-0', isActive ? 'text-ink' : 'text-muted group-hover:text-ink-2')} strokeWidth={1.9} />
                          {!compact && <span className="flex-1 truncate">{item.label}</span>}
                          {!!item.badge && (
                            <span
                              className={cn(
                                'tnum rounded-full text-2xs font-semibold',
                                compact
                                  ? 'absolute top-0.5 right-1 size-1.5 bg-warning text-[0px]'
                                  : item.to === '/ocorrencias'
                                    ? 'bg-warning-soft px-1.5 text-warning'
                                    : 'bg-ink/[0.06] px-1.5 text-muted',
                              )}
                            >
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line p-2.5">
        <div className={cn('flex items-center gap-2.5 px-1.5 py-1.5', compact && 'justify-center px-0')}>
          <Avatar name={profile.name} />
          {!compact && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-ink">{profile.name}</p>
              <p className="truncate text-xs text-muted">{ROLE_LABEL[profile.role]}</p>
            </div>
          )}
        </div>
        <div className={cn('mt-1 flex gap-0.5', compact ? 'flex-col items-center' : 'items-center')}>
          <FooterButton icon={UserRound} label="Perfil" compact={compact} onClick={onOpenProfile} />
          <FooterLink icon={Settings} label="Configurações" to="/organizacao" compact={compact} onClick={onNavigate} />
          <FooterButton icon={LogOut} label="Sair" compact={compact} onClick={() => void signOut()} />
        </div>
      </div>
    </nav>
  )
}

const footerClass = 'inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-muted transition-colors hover:bg-ink/[0.05] hover:text-ink'

function FooterButton({
  icon: Icon,
  label,
  compact,
  onClick,
}: {
  icon: LucideIcon
  label: string
  compact: boolean
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={footerClass}>
      <Icon className="size-3.5" />
      {!compact && label}
    </button>
  )
}

function FooterLink({
  icon: Icon,
  label,
  to,
  compact,
  onClick,
}: {
  icon: LucideIcon
  label: string
  to: string
  compact: boolean
  onClick?: () => void
}) {
  return (
    <NavLink to={to} onClick={onClick} title={label} aria-label={label} className={footerClass}>
      <Icon className="size-3.5" />
      {!compact && label}
    </NavLink>
  )
}
