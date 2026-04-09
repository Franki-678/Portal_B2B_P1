'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// ─── Helpers ──────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Props ────────────────────────────────────────────────────

interface ModelAutocompleteProps {
  label: string;
  required?: boolean;
  value: string;
  /** Llamado únicamente cuando el usuario elige una opción válida del dropdown */
  onSelect: (value: string) => void;
  /** Llamado cuando el campo se limpia (blur sin selección válida, o borra todo) */
  onClear: () => void;
  disabled?: boolean;
  placeholder?: string;
  error?: string;
  /** Función asíncrona que recibe el texto y devuelve las opciones */
  fetchOptions: (text: string) => Promise<string[]>;
  noResultsMessage?: string;
}

// ─── Componente ───────────────────────────────────────────────

export function ModelAutocomplete({
  label,
  required,
  value,
  onSelect,
  onClear,
  disabled = false,
  placeholder = 'Escribí para buscar...',
  error,
  fetchOptions,
  noResultsMessage = 'No encontrado. Podés describirlo en el campo de notas del repuesto.',
}: ModelAutocompleteProps) {
  const [inputText, setInputText] = useState(value);
  const [options, setOptions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [showNoResults, setShowNoResults] = useState(false);
  // Track si el valor actual fue confirmado desde el dropdown
  const [isValidSelection, setIsValidSelection] = useState(!!value);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedText = useDebounce(inputText, 300);

  // Sincronizar si el padre limpia el valor desde afuera
  useEffect(() => {
    if (!value) {
      setInputText('');
      setIsValidSelection(false);
      setOptions([]);
      setOpen(false);
      setShowNoResults(false);
    }
  }, [value]);

  // ── Búsqueda ──────────────────────────────────────────────

  const doSearch = useCallback(
    async (text: string) => {
      if (text.length < 2) {
        setOptions([]);
        setOpen(false);
        setShowNoResults(false);
        return;
      }
      setSearching(true);
      try {
        const results = await fetchOptions(text);
        setOptions(results);
        setShowNoResults(results.length === 0);
        setOpen(true);
      } catch {
        setOptions([]);
        setShowNoResults(false);
        setOpen(false);
      } finally {
        setSearching(false);
      }
    },
    [fetchOptions]
  );

  useEffect(() => {
    // Solo buscar si el texto no es la selección válida actual (el usuario está escribiendo)
    if (!isValidSelection) {
      doSearch(debouncedText);
    }
  }, [debouncedText, isValidSelection, doSearch]);

  // ── Click fuera ───────────────────────────────────────────

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
    const text = e.target.value;
    setInputText(text);
    setIsValidSelection(false); // el usuario está editando → ya no es válida la selección previa
    if (!text) {
      onClear();
      setOptions([]);
      setOpen(false);
      setShowNoResults(false);
    }
  };

  const handleSelect = (option: string) => {
    setInputText(option);
    setIsValidSelection(true);
    onSelect(option);
    setOpen(false);
    setOptions([]);
    setShowNoResults(false);
    inputRef.current?.focus();
  };

  const handleBlur = () => {
    setTimeout(() => {
      setOpen(false);
      // Si el usuario escribió algo pero no eligió del dropdown → limpiar
      if (inputText && !isValidSelection) {
        setInputText('');
        setOptions([]);
        setShowNoResults(false);
        onClear();
      }
    }, 160);
  };

  // ── Render ────────────────────────────────────────────────

  const inputId = label.toLowerCase().replace(/\s/g, '-');

  return (
    <div ref={containerRef} className="space-y-1.5 w-full relative">
      <label htmlFor={inputId} className="block text-xs font-semibold text-zinc-300 tracking-wide">
        {label} {required && <span className="text-orange-500">*</span>}
      </label>

      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={inputText}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={() => options.length > 0 && setOpen(true)}
          placeholder={disabled ? '— Primero elegí el modelo —' : placeholder}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className={[
            'w-full px-4 py-2.5 bg-zinc-950/50 border rounded-xl text-sm text-zinc-100 placeholder-zinc-600',
            'focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all duration-200 shadow-sm',
            disabled ? 'opacity-40 cursor-not-allowed' : 'hover:border-zinc-700',
            error
              ? 'border-rose-500/50 focus:ring-rose-500/50 focus:border-rose-500/50'
              : 'border-zinc-800',
          ].join(' ')}
        />

        {/* Spinner */}
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <span className="inline-block w-3.5 h-3.5 border-2 border-orange-500/40 border-t-orange-500 rounded-full animate-spin" />
          </div>
        )}

        {/* Ícono de check cuando hay selección válida */}
        {isValidSelection && !searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 text-sm font-bold select-none">
            ✓
          </div>
        )}
      </div>

      {error && <p className="text-xs font-medium text-rose-500">{error}</p>}

      {/* Dropdown */}
      {open && (options.length > 0 || showNoResults) && (
        <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
          {options.length > 0 ? (
            <ul className="max-h-60 overflow-y-auto divide-y divide-zinc-800/60">
              {options.map((opt) => (
                <li key={opt}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(opt)}
                    className="w-full text-left px-4 py-3 hover:bg-zinc-800/80 transition-colors text-sm text-zinc-200 hover:text-white font-medium"
                  >
                    {opt}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-3">
              <p className="text-xs text-zinc-400 leading-snug">{noResultsMessage}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
