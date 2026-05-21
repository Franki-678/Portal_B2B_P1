import { cn } from '@/lib/utils';
import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode, forwardRef } from 'react';

const NO_AUTOFILL = {
  autoComplete: 'off' as const,
  autoCorrect: 'off' as const,
  autoCapitalize: 'off' as const,
  spellCheck: false,
};

// ─── INPUT ─────────────────────────────────────────────────

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  /**
   * Optional element rendered inside the input on the right side.
   * Useful for password-toggle buttons, search icons, etc.
   * When provided, extra right-padding is added automatically.
   */
  rightElement?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ label, error, hint, rightElement, className, id, ...props }, ref) => {
  const inputId = id || label?.toLowerCase().replace(/\s/g, '-');
  return (
    <div className="space-y-1.5 w-full">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold text-zinc-300 tracking-wide">
          {label} {props.required && <span className="text-orange-500">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          {...NO_AUTOFILL}
          className={cn(
            'w-full px-4 py-2.5 bg-zinc-950/50 border rounded-xl text-sm text-zinc-100 placeholder-zinc-600',
            'focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all duration-200 shadow-sm',
            error ? 'border-rose-500/50 focus:ring-rose-500/50 focus:border-rose-500/50' : 'border-zinc-800 hover:border-zinc-700',
            rightElement != null ? 'pr-10' : undefined,
            className,
          )}
          {...props}
        />
        {rightElement && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-2.5">
            {rightElement}
          </div>
        )}
      </div>
      {error && <p className="text-xs font-medium text-rose-500">{error}</p>}
      {hint && !error && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
});
Input.displayName = 'Input';

// ─── SELECT ────────────────────────────────────────────────

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ label, error, hint, options, placeholder, className, id, ...props }, ref) => {
  const selectId = id || label?.toLowerCase().replace(/\s/g, '-');
  return (
    <div className="space-y-1.5 w-full">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-semibold text-zinc-300 tracking-wide">
          {label} {props.required && <span className="text-orange-500">*</span>}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        autoComplete="off"
        className={cn(
          'w-full px-4 py-2.5 bg-zinc-950/50 border rounded-xl text-sm text-zinc-100 appearance-none',
          'focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all duration-200 shadow-sm',
          error ? 'border-rose-500/50 focus:ring-rose-500/50 focus:border-rose-500/50' : 'border-zinc-800 hover:border-zinc-700',
          className,
        )}
        {...props}
      >
        {placeholder && <option value="" className="bg-zinc-900 text-zinc-500">{placeholder}</option>}
        {options.map(opt => (
          <option key={opt.value} value={opt.value} className="bg-zinc-900">{opt.label}</option>
        ))}
      </select>
      {error && <p className="text-xs font-medium text-rose-500">{error}</p>}
      {hint && !error && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
});
Select.displayName = 'Select';

// ─── TEXTAREA ──────────────────────────────────────────────

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ label, error, hint, className, id, ...props }, ref) => {
  const textareaId = id || label?.toLowerCase().replace(/\s/g, '-');
  return (
    <div className="space-y-1.5 w-full">
      {label && (
        <label htmlFor={textareaId} className="block text-xs font-semibold text-zinc-300 tracking-wide">
          {label} {props.required && <span className="text-orange-500">*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        id={textareaId}
        {...NO_AUTOFILL}
        className={cn(
          'w-full px-4 py-2.5 bg-zinc-950/50 border rounded-xl text-sm text-zinc-100 placeholder-zinc-600 resize-y min-h-[80px]',
          'focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all duration-200 shadow-sm',
          error ? 'border-rose-500/50 focus:ring-rose-500/50 focus:border-rose-500/50' : 'border-zinc-800 hover:border-zinc-700',
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs font-medium text-rose-500">{error}</p>}
      {hint && !error && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
});
Textarea.displayName = 'Textarea';
