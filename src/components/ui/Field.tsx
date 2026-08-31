import { cn } from "@/lib/utils";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-1.5">
      <label className="text-sm font-medium text-foreground">{children}</label>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

export function Input({ className, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return (
    <div>
      <input
        className={cn(
          "h-10 w-full rounded-xl border bg-surface px-3 text-sm text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent",
          error ? "border-danger" : "border-border",
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function Textarea({ className, error, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string }) {
  return (
    <div>
      <textarea
        className={cn(
          "w-full rounded-xl border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent",
          error ? "border-danger" : "border-border",
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function Select({ className, error, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { error?: string }) {
  return (
    <div>
      <select
        className={cn(
          "h-10 w-full rounded-xl border bg-surface px-3 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent",
          error ? "border-danger" : "border-border",
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function MoneyInput(props: InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
        R$
      </span>
      <Input type="number" step="0.01" min="0" inputMode="decimal" {...props} className={cn("pl-9", props.className)} />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  name,
  description,
}: {
  checked: boolean;
  onChange?: (value: boolean) => void;
  label: string;
  name?: string;
  description?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors mt-0.5" style={{ background: checked ? "var(--brand)" : "#d1d5db" }}>
        <input
          type="checkbox"
          name={name}
          checked={checked}
          onChange={(e) => onChange?.(e.target.checked)}
          className="peer sr-only"
        />
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-1"
          )}
        />
      </span>
      <span>
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
    </label>
  );
}
