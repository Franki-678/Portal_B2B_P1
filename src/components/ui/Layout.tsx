'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from './Button';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

interface SidebarProps {
  navItems: NavItem[];
  portalLabel: string;
  portalIcon: string;
  accentColor?: 'orange' | 'blue';
}

export function Sidebar({ navItems, portalLabel, portalIcon, accentColor = 'orange' }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const accent = accentColor === 'orange'
    ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
    : 'bg-blue-500/15 text-blue-400 border-blue-500/30';

  const activeClass = accentColor === 'orange'
    ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
    : 'bg-blue-500/15 text-blue-400 border-blue-500/30';

  return (
    <aside className="w-64 min-h-screen bg-[#13151f] border-r border-white/8 flex flex-col">
      {/* Logo / Brand */}
      <div className="p-5 border-b border-white/8">
        <div className="flex items-center gap-3">
          <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center text-lg border', accent)}>
            {portalIcon}
          </div>
          <div>
            <div className="font-bold text-white text-sm leading-tight">Portal B2B</div>
            <div className="text-xs text-slate-500">{portalLabel}</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(item => {
          const isActive = pathname === item.href || (item.href !== '/taller' && item.href !== '/vendedor' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 border',
                isActive
                  ? cn(activeClass, 'border')
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border-transparent',
              )}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User / Logout */}
      <div className="p-4 border-t border-white/8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-sm font-bold text-orange-400">
            {user?.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white truncate">{user?.name}</div>
            <div className="text-xs text-slate-500 truncate">{user?.email}</div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          fullWidth
          onClick={logout}
          className="text-slate-400 hover:text-red-400"
        >
          <span>🚪</span> Cerrar sesión
        </Button>
      </div>
    </aside>
  );
}

// ─── TOPBAR ────────────────────────────────────────────────

interface TopBarProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function TopBar({ title, subtitle, action }: TopBarProps) {
  return (
    <header className="bg-[#13151f]/80 backdrop-blur-sm border-b border-white/8 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
      <div>
        <h1 className="text-lg font-semibold text-white">{title}</h1>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </header>
  );
}

// ─── PAGE EMPTY STATE ──────────────────────────────────────

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-5xl mb-4 opacity-50">{icon}</div>
      <h3 className="text-base font-semibold text-slate-300 mb-2">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm mb-6">{description}</p>
      {action}
    </div>
  );
}

// ─── LOADING ───────────────────────────────────────────────

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
    </div>
  );
}
