import { cn } from '@/lib/utils';
import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';

// ─── INPUT ─────────────────────────────────────────────────

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ label, error, hint, className, id, ...props }, ref) => {
  const inputId = id || label?.toLowerCase().replace(/\s/g, '-');
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-slate-300">
          {label} {props.required && <span className="text-orange-400">*</span>}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          'w-full px-3.5 py-2.5 bg-[#0f1117] border rounded-lg text-sm text-white placeholder-slate-500',
          'focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all',
          error ? 'border-red-500/50' : 'border-white/10 hover:border-white/20',
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
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
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-medium text-slate-300">
          {label} {props.required && <span className="text-orange-400">*</span>}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={cn(
          'w-full px-3.5 py-2.5 bg-[#0f1117] border rounded-lg text-sm text-white',
          'focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all',
          error ? 'border-red-500/50' : 'border-white/10 hover:border-white/20',
          className,
        )}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(opt => (
          <option key={opt.value} value={opt.value} className="bg-[#1a1d27]">{opt.label}</option>
        ))}
      </select>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
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
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={textareaId} className="block text-xs font-medium text-slate-300">
          {label} {props.required && <span className="text-orange-400">*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        id={textareaId}
        className={cn(
          'w-full px-3.5 py-2.5 bg-[#0f1117] border rounded-lg text-sm text-white placeholder-slate-500 resize-none',
          'focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all',
          error ? 'border-red-500/50' : 'border-white/10 hover:border-white/20',
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
});
Textarea.displayName = 'Textarea';
