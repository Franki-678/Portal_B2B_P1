'use client';

/**
 * CreatableCombobox
 * ─────────────────────────────────────────────────────────────
 * Input con autocompletado que consume el diccionario_repuestos.
 * Si el usuario escribe un valor que no existe y presiona Enter
 * (o hace click en "＋ Agregar"), el sistema:
 *   1. Selecciona ese texto para el campo del formulario
 *   2. Hace un INSERT silencioso en diccionario_repuestos
 *      para que esté disponible en el futuro
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import {
  fetchDiccionarioSuggestions,
  insertDiccionarioEntry,
} from '@/lib/supabase/queries';
import { cn } from '@/lib/utils';

// ─── Debounce ──────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Props ─────────────────────────────────────────────────────

interface CreatableComboboxProps {
  label?: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
}

// ─── Componente ────────────────────────────────────────────────

export function CreatableCombobox({
  label,
  required,
  value,
  onChange,
  error,
  placeholder = 'Escribí o seleccioná un repuesto…',
  disabled = false,
  hint,
}: CreatableComboboxProps) {
  const [options, setOptions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const isSelectingRef = useRef(false);

  const debouncedValue = useDebounce(value, 250);

  // ── Búsqueda en diccionario ──────────────────────────────────

  const search = useCallback(async (text: string) => {
    if (isSelectingRef.current) return;
    if (text.trim().length < 2) {
      setOptions([]);
      setOpen(false);
      setFocusedIdx(-1);
      return;
    }
    setSearching(true);
    try {
      const sb = getSupabaseClient();
      const results = await fetchDiccionarioSuggestions(sb, text);
      setOptions(results);
      setOpen(true);
      setFocusedIdx(-1);
    } catch {
      setOptions([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    void search(debouncedValue);
  }, [debouncedValue, search]);

  // ── Cerrar al click fuera ────────────────────────────────────

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFocusedIdx(-1);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ── Seleccionar opción existente ─────────────────────────────

  const handleSelect = (option: string) => {
    isSelectingRef.current = true;
    onChange(option);
    setOpen(false);
    setOptions([]);
    setFocusedIdx(-1);
    inputRef.current?.focus();
    setTimeout(() => { isSelectingRef.current = false; }, 350);
  };

  // ── Crear entrada nueva (INSERT silencioso) ──────────────────

  const handleCreate = useCallback(async (nombre: string) => {
    const trimmed = nombre.trim();
    if (!trimmed || trimmed.length < 2) return;

    isSelectingRef.current = true;
    onChange(trimmed);
    setOpen(false);
    setOptions([]);
    setFocusedIdx(-1);

    // INSERT silencioso — no bloquea el formulario
    try {
      const sb = getSupabaseClient();
      await insertDiccionarioEntry(sb, trimmed);
    } catch {
      // Ignorar — el formulario continúa igual
    }

    setTimeout(() => { isSelectingRef.current = false; }, 350);
  }, [onChange]);

  // ── Teclado ──────────────────────────────────────────────────

  const totalOptions = options.length + (showCreate(value, options) ? 1 : 0);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && e.key !== 'Enter') return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIdx(i => Math.min(i + 1, totalOptions - 1));
        break;

      case 'ArrowUp':
        e.preventDefault();
        setFocusedIdx(i => Math.max(i - 1, -1));
        break;

      case 'Enter': {
        e.preventDefault();
        const trimmed = value.trim();
        if (!trimmed) return;

        // Si hay un ítem del dropdown con foco → seleccionarlo
        if (focusedIdx >= 0 && focusedIdx < options.length) {
          handleSelect(options[focusedIdx]);
          return;
        }
        // Si el ítem del foco es "Crear" → crear
        if (focusedIdx === options.length && showCreate(value, options)) {
          void handleCreate(trimmed);
          return;
        }
        // Sin foco explícito: match exacto → seleccionar; si no → crear
        const exact = options.find(o => o.toLowerCase() === trimmed.toLowerCase());
        if (exact) handleSelect(exact);
        else void handleCreate(trimmed);
        break;
      }

      case 'Escape':
        setOpen(false);
        setFocusedIdx(-1);
        break;
    }
  };

  const inputId = label?.toLowerCase().replace(/\s+/g, '-') ?? 'creatable-combobox';
  const hasCreateOption = showCreate(value, options);

  return (
    <div ref={containerRef} className="space-y-1.5 w-full relative">

      {/* Label */}
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold text-zinc-300 tracking-wide">
          {label} {required && <span className="text-orange-500">*</span>}
        </label>
      )}

      {/* Input */}
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={e => {
            if (!isSelectingRef.current) onChange(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (value.trim().length >= 2) setOpen(true);
          }}
          className={cn(
            'w-full px-4 py-2.5 bg-zinc-950/50 border rounded-xl text-sm text-zinc-100 placeholder-zinc-600',
            'focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all duration-200 shadow-sm',
            disabled && 'opacity-50 cursor-not-allowed',
            error
              ? 'border-rose-500/50 focus:ring-rose-500/50 focus:border-rose-500/50'
              : 'border-zinc-800 hover:border-zinc-700',
          )}
        />

        {/* Spinner de búsqueda */}
        {searching && !disabled && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <span className="inline-block w-3.5 h-3.5 border-2 border-orange-500/40 border-t-orange-500 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Error / hint */}
      {error
        ? <p className="text-xs font-medium text-rose-500">{error}</p>
        : hint && <p className="text-[11px] text-zinc-500">{hint}</p>
      }

      {/* Dropdown */}
      {open && !disabled && (options.length > 0 || hasCreateOption) && (
        <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl shadow-black/60 overflow-hidden">

          {/* Opciones existentes */}
          {options.length > 0 && (
            <ul ref={listRef} className="max-h-52 overflow-y-auto divide-y divide-zinc-800/50">
              {options.map((opt, idx) => (
                <li key={opt}>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleSelect(opt)}
                    onMouseEnter={() => setFocusedIdx(idx)}
                    className={cn(
                      'w-full text-left px-4 py-2.5 text-sm transition-colors',
                      focusedIdx === idx
                        ? 'bg-zinc-700/60 text-white'
                        : 'text-zinc-200 hover:bg-zinc-800/70 hover:text-white'
                    )}
                  >
                    {opt}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Opción "Crear nuevo" */}
          {hasCreateOption && (
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => void handleCreate(value.trim())}
              onMouseEnter={() => setFocusedIdx(options.length)}
              className={cn(
                'w-full text-left px-4 py-2.5 text-sm font-semibold transition-colors flex items-center gap-2',
                options.length > 0 && 'border-t border-zinc-800/60',
                focusedIdx === options.length
                  ? 'bg-orange-500/15 text-orange-300'
                  : 'text-orange-400/80 hover:bg-orange-500/10 hover:text-orange-300'
              )}
            >
              <span className="text-base leading-none">＋</span>
              <span>
                Agregar <span className="font-bold">«{value.trim()}»</span>
              </span>
            </button>
          )}

          {/* Footer hint */}
          <div className="px-4 py-1.5 border-t border-zinc-800/40 bg-zinc-950/40">
            <p className="text-[10px] text-zinc-600">
              ↵ Enter para confirmar · ↑↓ para navegar
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper ────────────────────────────────────────────────────

/** Muestra la opción "Crear" solo si el valor no coincide exactamente con ninguna opción existente */
function showCreate(value: string, options: string[]): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 2) return false;
  return !options.some(o => o.toLowerCase() === trimmed.toLowerCase());
}
