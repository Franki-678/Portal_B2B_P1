'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';

// ─── Tipos ────────────────────────────────────────────────────

interface CatalogoItem {
  codigo: string;
  descripcion: string;
}

interface PartsAutocompleteProps {
  label?: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  /** Llamado cuando el usuario selecciona del dropdown: (codigo, descripcion) */
  onSelect: (codigo: string | null, descripcion: string) => void;
  /** Modelo del vehículo para pre-filtrar por marca */
  vehicleModel?: string;
  error?: string;
  placeholder?: string;
}

// ─── Helpers ─────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Componente ───────────────────────────────────────────────

export function PartsAutocomplete({
  label = 'Pieza / Repuesto solicitado',
  required,
  value,
  onChange,
  onSelect,
  vehicleModel = '',
  error,
  placeholder = 'Ej: Paragolpe delantero, Capot, Óptica…',
}: PartsAutocompleteProps) {
  const [results, setResults] = useState<CatalogoItem[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedValue = useDebounce(value, 300);

  // ── Búsqueda en Supabase ──────────────────────────────────

  const search = useCallback(async (text: string, model: string) => {
    if (text.length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }

    setSearching(true);

    try {
      const sb = getSupabaseClient();
      const pattern = `%${text}%`;

      // Búsqueda con filtro de marca si hay modelo
      if (model.trim()) {
        const { data, error: err } = await (sb as any)
          .from('catalogo_repuestos')
          .select('codigo, descripcion')
          .ilike('descripcion', pattern)
          .ilike('marca', `%${model.trim()}%`)
          .limit(8);

        if (!err && data && data.length > 0) {
          setResults(data as CatalogoItem[]);
          setOpen(true);
          return;
        }
      }

      // Fallback: catálogo completo
      const { data, error: err2 } = await (sb as any)
        .from('catalogo_repuestos')
        .select('codigo, descripcion')
        .ilike('descripcion', pattern)
        .limit(8);

      if (!err2 && data) {
        setResults(data as CatalogoItem[]);
        setOpen(data.length > 0);
      } else {
        setResults([]);
        setOpen(false);
      }
    } catch {
      setResults([]);
      setOpen(false);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    search(debouncedValue, vehicleModel);
  }, [debouncedValue, vehicleModel, search]);

  // ── Cerrar al click fuera ────────────────────────────────

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ── Handlers ─────────────────────────────────────────────

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    onChange(newVal);
    // Si el usuario borra todo, limpiar selección
    if (!newVal) {
      onSelect(null, '');
    }
  };

  const handleSelect = (item: CatalogoItem) => {
    onChange(item.descripcion);
    onSelect(item.codigo, item.descripcion);
    setOpen(false);
    setResults([]);
    inputRef.current?.focus();
  };

  const handleBlur = () => {
    // Pequeño delay para que el click en el item se registre antes de cerrar
    setTimeout(() => setOpen(false), 150);
  };

  // ── Render ───────────────────────────────────────────────

  const inputId = label?.toLowerCase().replace(/\s/g, '-') ?? 'parts-autocomplete';

  return (
    <div ref={containerRef} className="space-y-1.5 w-full relative">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold text-zinc-300 tracking-wide">
          {label} {required && <span className="text-orange-500">*</span>}
        </label>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className={[
            'w-full px-4 py-2.5 bg-zinc-950/50 border rounded-xl text-sm text-zinc-100 placeholder-zinc-600',
            'focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all duration-200 shadow-sm',
            error
              ? 'border-rose-500/50 focus:ring-rose-500/50 focus:border-rose-500/50'
              : 'border-zinc-800 hover:border-zinc-700',
          ].join(' ')}
        />

        {/* Indicador de búsqueda */}
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <span className="inline-block w-3.5 h-3.5 border-2 border-orange-500/40 border-t-orange-500 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {error && <p className="text-xs font-medium text-rose-500">{error}</p>}

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
          <ul className="max-h-64 overflow-y-auto divide-y divide-zinc-800/60">
            {results.map((item) => (
              <li key={item.codigo}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()} // evita onBlur antes del click
                  onClick={() => handleSelect(item)}
                  className="w-full text-left px-4 py-3 hover:bg-zinc-800/80 transition-colors group"
                >
                  <span className="block text-[10px] font-mono text-orange-400 group-hover:text-orange-300 mb-0.5">
                    {item.codigo}
                  </span>
                  <span className="block text-sm text-zinc-200 group-hover:text-white font-medium leading-tight">
                    {item.descripcion}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="px-4 py-2 border-t border-zinc-800/60 bg-zinc-950/60">
            <p className="text-[10px] text-zinc-600 font-medium">
              {results.length} resultado{results.length !== 1 ? 's' : ''} · Podés editar la descripción libremente
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
