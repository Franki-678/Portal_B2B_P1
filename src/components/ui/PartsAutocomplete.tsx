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
  /** Llamado cuando el usuario selecciona del dropdown: (codigo | null, descripcion) */
  onSelect: (codigo: string | null, descripcion: string) => void;
  /** Marca seleccionada (del dropdown de marca) */
  vehicleBrand?: string;
  /** Modelo escrito por el taller (texto libre) */
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
  vehicleBrand = '',
  vehicleModel = '',
  error,
  placeholder = 'Ej: Paragolpe delantero, Capot, Óptica…',
}: PartsAutocompleteProps) {
  const [results, setResults] = useState<CatalogoItem[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [showNoResults, setShowNoResults] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedValue = useDebounce(value, 350);

  // ── Búsqueda en cascada ──────────────────────────────────

  const search = useCallback(async (text: string, brand: string, model: string) => {
    if (text.length < 3) {
      setResults([]);
      setOpen(false);
      setShowNoResults(false);
      return;
    }

    setSearching(true);

    try {
      const sb = getSupabaseClient();
      const pattern = `%${text}%`;

      // Intento 1: filtro por marca Y modelo
      if (brand.trim() && model.trim()) {
        const { data, error: err } = await (sb as any)
          .from('catalogo_repuestos')
          .select('codigo, descripcion')
          .eq('marca', brand.trim())
          .ilike('descripcion', `%${model.trim()}%`)
          .ilike('descripcion', pattern)
          .limit(8);

        if (!err && data && data.length > 0) {
          setResults(data as CatalogoItem[]);
          setShowNoResults(false);
          setOpen(true);
          return;
        }
      }

      // Intento 2: filtro solo por marca
      if (brand.trim()) {
        const { data, error: err } = await (sb as any)
          .from('catalogo_repuestos')
          .select('codigo, descripcion')
          .eq('marca', brand.trim())
          .ilike('descripcion', pattern)
          .limit(8);

        if (!err && data && data.length > 0) {
          setResults(data as CatalogoItem[]);
          setShowNoResults(false);
          setOpen(true);
          return;
        }
      }

      // Intento 3: catálogo completo
      const { data, error: err3 } = await (sb as any)
        .from('catalogo_repuestos')
        .select('codigo, descripcion')
        .ilike('descripcion', pattern)
        .limit(8);

      if (!err3 && data) {
        setResults(data as CatalogoItem[]);
        const hasResults = data.length > 0;
        setShowNoResults(!hasResults);
        setOpen(true);
      } else {
        setResults([]);
        setShowNoResults(true);
        setOpen(true);
      }
    } catch {
      setResults([]);
      setShowNoResults(false);
      setOpen(false);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    search(debouncedValue, vehicleBrand, vehicleModel);
  }, [debouncedValue, vehicleBrand, vehicleModel, search]);

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
    // Al editar texto libre, limpiar el código asociado
    if (!newVal) {
      onSelect(null, '');
    }
  };

  const handleSelect = (item: CatalogoItem) => {
    onChange(item.descripcion);
    onSelect(item.codigo, item.descripcion);
    setOpen(false);
    setResults([]);
    setShowNoResults(false);
    inputRef.current?.focus();
  };

  const handleBlur = () => {
    // Pequeño delay para que el click en el item se registre antes de cerrar
    setTimeout(() => setOpen(false), 160);
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
          onFocus={() => (results.length > 0 || showNoResults) && setOpen(true)}
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

        {/* Spinner de búsqueda */}
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <span className="inline-block w-3.5 h-3.5 border-2 border-orange-500/40 border-t-orange-500 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {error && <p className="text-xs font-medium text-rose-500">{error}</p>}

      {/* Dropdown */}
      {open && (results.length > 0 || showNoResults) && (
        <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
          {results.length > 0 ? (
            <>
              <ul className="max-h-64 overflow-y-auto divide-y divide-zinc-800/60">
                {results.map((item) => (
                  <li key={item.codigo}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelect(item)}
                      className="w-full text-left px-4 py-3 hover:bg-zinc-800/80 transition-colors group"
                    >
                      {/* Solo descripción, sin código */}
                      <span className="block text-sm text-zinc-200 group-hover:text-white font-medium leading-tight">
                        {item.descripcion}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="px-4 py-2 border-t border-zinc-800/60 bg-zinc-950/60">
                <p className="text-[10px] text-zinc-600 font-medium">
                  {results.length} resultado{results.length !== 1 ? 's' : ''} en catálogo
                </p>
              </div>
            </>
          ) : (
            <div className="px-4 py-3.5">
              <p className="text-xs text-zinc-400 leading-snug">
                No encontramos este repuesto en el catálogo.{' '}
                <span className="text-zinc-300 font-medium">
                  Podés describirlo igual y el vendedor lo buscará.
                </span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
