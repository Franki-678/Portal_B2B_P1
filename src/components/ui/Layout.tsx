'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { cn, getTallerDisplayName } from '@/lib/utils';
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
  accentColor?: 'orange' | 'blue' | 'purple';
}

const ACCENT_CLASS: Record<NonNullable<SidebarProps['accentColor']>, string> = {
  orange: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  blue: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  purple: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

const AVATAR_CLASS: Record<NonNullable<SidebarProps['accentColor']>, string> = {
  orange: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  blue: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
  purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

const SIDEBAR_EXPANDED_WIDTH = 250;
const SIDEBAR_COLLAPSED_WIDTH = 88;
const SIDEBAR_TOGGLE_EVENT = 'portal-sidebar-toggle';

function toTitleCase(value: string) {
  return value
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function buildBreadcrumbs(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return [{ href: '/', label: 'Inicio' }];
  }

  return segments.map((segment, index) => ({
    href: `/${segments.slice(0, index + 1).join('/')}`,
    label: toTitleCase(decodeURIComponent(segment)),
  }));
}

export function Sidebar({ navItems, portalLabel, portalIcon, accentColor = 'orange' }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const tallerLabel = user?.role === 'taller' ? getTallerDisplayName(user) : '';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tabletCollapsed, setTabletCollapsed] = useState(true);

  const accent = ACCENT_CLASS[accentColor];
  const activeClass = ACCENT_CLASS[accentColor];
  const avatarClass = AVATAR_CLASS[accentColor];
  const isCollapsed = tabletCollapsed;

  useEffect(() => {
    const handleToggle = () => setMobileOpen(prev => !prev);
    window.addEventListener(SIDEBAR_TOGGLE_EVENT, handleToggle);
    return () => window.removeEventListener(SIDEBAR_TOGGLE_EVENT, handleToggle);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm transition-opacity md:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={() => setMobileOpen(false)}
      />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-screen flex-col border-r border-slate-800 bg-slate-950 text-slate-100 shadow-2xl shadow-black/30 transition-transform md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{
          width: `${SIDEBAR_EXPANDED_WIDTH}px`,
        }}
      >
        <div
          className="hidden h-full md:flex md:flex-col"
          style={{
            width: `${isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH}px`,
          }}
        >
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-5">
            <div className="flex items-center gap-3 overflow-hidden">
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-lg shadow-sm',
                  accent
                )}
              >
                {portalIcon}
              </div>
              <div className={cn('min-w-0', isCollapsed && 'hidden xl:block')}>
                <div className="truncate text-sm font-bold tracking-tight text-slate-100">Portal B2B</div>
                <div className="truncate text-xs font-medium text-slate-400">{portalLabel}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTabletCollapsed(prev => !prev)}
              className="hidden rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-400 transition hover:border-slate-700 hover:text-slate-100 lg:block xl:hidden"
              aria-label={isCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
            >
              {isCollapsed ? '→' : '←'}
            </button>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
            {navItems.map(item => {
              const isActive =
                pathname === item.href ||
                (item.href !== '/taller' &&
                  item.href !== '/vendedor' &&
                  item.href !== '/admin' &&
                  pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-3 py-3 text-sm font-medium transition-all duration-200',
                    isActive
                      ? cn(activeClass, 'shadow-sm')
                      : 'border-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-900 hover:text-slate-100',
                    isCollapsed && 'justify-center px-2 xl:justify-start xl:px-3'
                  )}
                  title={isCollapsed ? item.label : undefined}
                >
                  <span className="text-base">{item.icon}</span>
                  <span className={cn(isCollapsed && 'hidden xl:inline')}>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-slate-800 p-4">
            <div
              className={cn(
                'mb-3 flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-2.5',
                isCollapsed && 'justify-center xl:justify-start'
              )}
            >
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xs font-bold transition-colors',
                  avatarClass
                )}
              >
                {user?.role === 'taller'
                  ? (tallerLabel[0] || 'T').toUpperCase()
                  : user?.role === 'admin'
                    ? 'A'
                    : 'V'}
              </div>
              <div className={cn('min-w-0 flex-1', isCollapsed && 'hidden xl:block')}>
                <div className="truncate text-xs font-bold tracking-tight text-slate-100">
                  {user?.role === 'taller'
                    ? tallerLabel
                    : user?.role === 'admin'
                      ? (user?.name ?? 'Admin')
                      : (user?.name ?? 'Vendedor')}
                </div>
                <div className="truncate text-[10px] font-medium text-slate-500">{user?.email}</div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              onClick={logout}
              className={cn(
                'text-slate-400 hover:bg-rose-500/5 hover:text-rose-400',
                isCollapsed && 'px-2 xl:px-3'
              )}
            >
              <span>🚪</span>
              <span className={cn(isCollapsed && 'hidden xl:inline')}>Cerrar sesión</span>
            </Button>
          </div>
        </div>

        <div className="flex h-full flex-col md:hidden">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-5">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl border text-lg shadow-sm',
                  accent
                )}
              >
                {portalIcon}
              </div>
              <div>
                <div className="text-sm font-bold tracking-tight text-slate-100">Portal B2B</div>
                <div className="text-xs font-medium text-slate-400">{portalLabel}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-400"
              aria-label="Cerrar sidebar"
            >
              ✕
            </button>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
            {navItems.map(item => {
              const isActive =
                pathname === item.href ||
                (item.href !== '/taller' &&
                  item.href !== '/vendedor' &&
                  item.href !== '/admin' &&
                  pathname.startsWith(item.href));

              return (
                <Link
                  key={`mobile-${item.href}`}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-3 py-3 text-sm font-medium transition-all duration-200',
                    isActive
                      ? cn(activeClass, 'shadow-sm')
                      : 'border-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-900 hover:text-slate-100'
                  )}
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-slate-800 p-4">
            <div className="mb-3 flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-2.5">
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xs font-bold transition-colors',
                  avatarClass
                )}
              >
                {user?.role === 'taller'
                  ? (tallerLabel[0] || 'T').toUpperCase()
                  : user?.role === 'admin'
                    ? 'A'
                    : 'V'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold tracking-tight text-slate-100">
                  {user?.role === 'taller'
                    ? tallerLabel
                    : user?.role === 'admin'
                      ? (user?.name ?? 'Admin')
                      : (user?.name ?? 'Vendedor')}
                </div>
                <div className="truncate text-[10px] font-medium text-slate-500">{user?.email}</div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              onClick={logout}
              className="text-slate-400 hover:bg-rose-500/5 hover:text-rose-400"
            >
              <span>🚪</span> Cerrar sesión
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}

// ─── TOPBAR ────────────────────────────────────────────────

interface TopBarProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function TopBar({ title, subtitle, action }: TopBarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const breadcrumbs = useMemo(() => buildBreadcrumbs(pathname), [pathname]);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur-xl shadow-sm shadow-black/10">
      <div className="flex items-center justify-between gap-4 px-4 py-4 md:px-6">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(SIDEBAR_TOGGLE_EVENT))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 md:hidden"
              aria-label="Abrir sidebar"
            >
              ☰
            </button>
            <nav className="flex flex-wrap items-center gap-2">
              {breadcrumbs.map((crumb, index) => (
                <span key={crumb.href} className="flex items-center gap-2">
                  {index > 0 && <span className="text-slate-700">/</span>}
                  <Link href={crumb.href} className="transition hover:text-slate-300">
                    {crumb.label}
                  </Link>
                </span>
              ))}
            </nav>
          </div>
          <h1 className="truncate text-lg font-bold tracking-tight text-slate-100">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm font-medium text-slate-400">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-3">
          {action && <div className="hidden sm:block">{action}</div>}
          <div className="hidden rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-right md:block">
            <div className="max-w-44 truncate text-sm font-semibold text-slate-100">{user?.name ?? 'Usuario'}</div>
            <div className="max-w-44 truncate text-xs text-slate-500">{user?.email}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout} className="text-slate-400 hover:text-rose-400">
            Cerrar sesión
          </Button>
        </div>
      </div>

      {action && <div className="border-t border-slate-800 px-4 py-3 sm:hidden">{action}</div>}
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
