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
    <aside className="w-64 min-h-screen bg-zinc-950/50 backdrop-blur-xl border-r border-zinc-800/80 flex flex-col">
      {/* Logo / Brand */}
      <div className="p-5 border-b border-zinc-800/80">
        <div className="flex items-center gap-3">
          <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center text-lg border shadow-sm', accent)}>
            {portalIcon}
          </div>
          <div>
            <div className="font-bold text-zinc-100 text-sm leading-tight tracking-tight">Portal B2B</div>
            <div className="text-xs text-zinc-500 font-medium">{portalLabel}</div>
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
                  ? cn(activeClass, 'shadow-sm')
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 border-transparent',
              )}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User / Logout */}
      <div className="p-4 border-t border-zinc-800/80">
        <div className="flex items-center gap-3 mb-3 bg-zinc-900/50 p-2 rounded-lg border border-zinc-800/50">
          <div className={cn(
            'w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold border transition-colors',
            accentColor === 'orange' 
              ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' 
              : 'bg-sky-500/10 text-sky-500 border-sky-500/20'
          )}>
            {user?.role === 'taller' 
              ? (user?.workshopName?.[0] || user?.name?.[0] || 'T').toUpperCase()
              : 'V'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-zinc-100 truncate tracking-tight">
              {user?.role === 'taller' ? (user?.workshopName || user?.name) : 'Vendedor'}
            </div>
            <div className="text-[10px] font-medium text-zinc-500 truncate">{user?.email}</div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          fullWidth
          onClick={logout}
          className="text-zinc-400 hover:text-rose-400 hover:bg-rose-500/5"
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
    <header className="bg-zinc-950/60 backdrop-blur-xl border-b border-zinc-800/80 px-8 py-5 flex items-center justify-between sticky top-0 z-20 shadow-sm shadow-black/10">
      <div>
        <h1 className="text-lg font-bold text-zinc-100 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm font-medium text-zinc-500 mt-0.5">{subtitle}</p>}
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
    <div className="flex flex-col items-center justify-center py-20 text-center bg-zinc-900/30 border border-zinc-800/50 rounded-2xl mx-6 shadow-inner shadow-black/20">
      <div className="text-5xl mb-5 opacity-60 drop-shadow-md">{icon}</div>
      <h3 className="text-base font-bold text-zinc-200 mb-2">{title}</h3>
      <p className="text-sm text-zinc-500 max-w-sm mb-6">{description}</p>
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
