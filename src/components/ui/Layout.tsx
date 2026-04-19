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
  /** Mantenemos la prop por compatibilidad, pero todo usa orange ahora */
  accentColor?: 'orange' | 'blue' | 'purple';
}

const SIDEBAR_TOGGLE_EVENT = 'portal-sidebar-toggle';

function toTitleCase(value: string) {
  return value
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildBreadcrumbs(pathname: string, orderLabel?: string) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return [{ href: '/', label: 'Inicio' }];
  return segments.map((segment, index) => ({
    href: `/${segments.slice(0, index + 1).join('/')}`,
    label: UUID_REGEX.test(segment)
      ? (orderLabel ?? 'Pedido')
      : toTitleCase(decodeURIComponent(segment)),
  }));
}

/** Sidebar interior reutilizable */
function SidebarContent({
  navItems,
  portalLabel,
  portalIcon,
  onClose,
}: SidebarProps & { onClose?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const tallerLabel = user?.role === 'taller' ? getTallerDisplayName(user) : '';

  const displayName =
    user?.role === 'taller'
      ? tallerLabel
      : user?.role === 'admin'
        ? (user?.name ?? 'Admin')
        : (user?.name ?? 'Vendedor');

  const avatarLetter =
    user?.role === 'taller'
      ? (tallerLabel[0] || 'T').toUpperCase()
      : user?.role === 'admin'
        ? 'A'
        : 'V';

  return (
    <div className="flex h-full w-full flex-col bg-zinc-900 text-zinc-100">

      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/10 text-base shadow-sm">
            {portalIcon}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold tracking-tight text-white">Portal B2B</div>
            <div className="truncate text-[11px] font-medium text-zinc-400">{portalLabel}</div>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:text-white transition"
            aria-label="Cerrar menú"
          >
            ✕
          </button>
        )}
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
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
                'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all duration-150',
                isActive
                  ? 'border-orange-500/30 bg-orange-500/10 text-orange-400 shadow-sm'
                  : 'border-transparent text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100'
              )}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* ── Footer / User ── */}
      <div className="border-t border-zinc-800 p-4 space-y-3">
        <div className="flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-800/60 px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-orange-500/20 bg-orange-500/10 text-xs font-bold text-orange-400">
            {avatarLetter}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold text-white">{displayName}</div>
            <div className="truncate text-[10px] text-zinc-500">{user?.email}</div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          fullWidth
          onClick={logout}
          className="text-zinc-400 hover:bg-rose-500/10 hover:text-rose-400"
        >
          <span>🚪</span>
          <span>Cerrar sesión</span>
        </Button>
      </div>
    </div>
  );
}

export function Sidebar(props: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

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
      {/* Overlay móvil */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity md:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={() => setMobileOpen(false)}
      />

      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-50 hidden h-screen w-64 border-r border-zinc-800 shadow-xl shadow-black/50 md:block">
        <SidebarContent {...props} />
      </aside>

      {/* Sidebar móvil */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 h-screen w-72 border-r border-zinc-800 shadow-2xl shadow-black/60 transition-transform duration-300 md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <SidebarContent {...props} onClose={() => setMobileOpen(false)} />
      </aside>
    </>
  );
}

// ─── TOPBAR ────────────────────────────────────────────────

interface TopBarProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  /** Label to show in place of a UUID segment in breadcrumbs (e.g. "01-PED-0001") */
  orderLabel?: string;
}

export function TopBar({ title, subtitle, action, orderLabel }: TopBarProps) {
  const pathname = usePathname();
  const breadcrumbs = useMemo(() => buildBreadcrumbs(pathname, orderLabel), [pathname, orderLabel]);

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-xl shadow-sm shadow-black/20">
      <div className="flex items-center justify-between gap-4 px-4 py-4 md:px-6">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-500">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(SIDEBAR_TOGGLE_EVENT))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 transition hover:border-orange-500/30 hover:text-orange-400 md:hidden"
              aria-label="Abrir sidebar"
            >
              ☰
            </button>
            <nav className="flex flex-wrap items-center gap-2">
              {breadcrumbs.map((crumb, index) => (
                <span key={crumb.href} className="flex items-center gap-2">
                  {index > 0 && <span className="text-zinc-700">/</span>}
                  <Link href={crumb.href} className="transition hover:text-zinc-300">
                    {crumb.label}
                  </Link>
                </span>
              ))}
            </nav>
          </div>
          <h1 className="truncate text-lg font-bold tracking-tight text-zinc-100">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm font-medium text-zinc-400">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-3">
          {action && <div className="hidden sm:block">{action}</div>}
        </div>
      </div>

      {action && <div className="border-t border-zinc-800 px-4 py-3 sm:hidden">{action}</div>}
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
