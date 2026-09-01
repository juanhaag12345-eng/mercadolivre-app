"use client";

import { cn } from "@/lib/utils";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type InputHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-1.5">
      <label className="text-sm font-medium text-foreground">{children}</label>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

/**
 * Seleciona todo o conteúdo do campo assim que ele ganha foco — inclusive
 * ao focar com um clique do mouse, não só com Tab.
 *
 * Só chamar `.select()` no onFocus não basta: quando o foco vem de um
 * clique, o próprio mouseup desse clique roda DEPOIS do focus e o
 * navegador usa ele pra posicionar o cursor no ponto clicado, desfazendo a
 * seleção que acabamos de fazer. Por isso cancelamos esse primeiro mouseup
 * (só ele — cliques seguintes, com o campo já focado, voltam a posicionar
 * o cursor normalmente, permitindo editar um ponto específico do texto).
 * Era por causa disso que dava pra ver o "0"/"1" selecionado por uma
 * fração de segundo e, na hora de digitar, ele continuava lá.
 */
function useSelectAllOnFocus() {
  const justFocusedRef = useRef(false);
  return {
    handleFocus(e: FocusEvent<HTMLInputElement>) {
      justFocusedRef.current = true;
      e.target.select();
    },
    handleMouseUp(e: MouseEvent<HTMLInputElement>) {
      if (justFocusedRef.current) {
        justFocusedRef.current = false;
        e.preventDefault();
      }
    },
  };
}

export function Input({ className, error, onFocus, onMouseUp, ...props }: InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  const selectAll = useSelectAllOnFocus();
  return (
    <div>
      <input
        onFocus={(e) => {
          selectAll.handleFocus(e);
          onFocus?.(e);
        }}
        onMouseUp={(e) => {
          selectAll.handleMouseUp(e);
          onMouseUp?.(e);
        }}
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

// Converte um número para texto editável usando vírgula (padrão brasileiro),
// sem casas decimais forçadas — 35.9 vira "35,9", 0 vira "0".
function formatDecimalForEdit(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return rounded.toString().replace(".", ",");
}

/**
 * Campo numérico decimal amigável ao padrão brasileiro: aceita vírgula OU
 * ponto como separador decimal, e seleciona tudo ao focar para substituir o
 * "0" inicial com um único toque de tecla.
 *
 * Usa `<input type="text" inputMode="decimal">` em vez de `type="number"`
 * porque o input nativo `number` simplesmente ignora o caractere "," — é
 * por isso que não dava pra digitar vírgula nos campos de valor.
 *
 * O valor de fato enviado no formulário vai por um input escondido, sempre
 * com ponto decimal (formato que o `z.coerce.number()` no servidor espera).
 */
export function DecimalInput({
  name,
  value,
  onValueChange,
  className,
  error,
  allowNegative = false,
  ...props
}: {
  name?: string;
  value: number;
  onValueChange: (value: number) => void;
  className?: string;
  error?: string;
  allowNegative?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "name" | "type">) {
  const [text, setText] = useState(() => formatDecimalForEdit(value));
  const focusedRef = useRef(false);
  const selectAll = useSelectAllOnFocus();

  // Só re-sincroniza o texto exibido com o valor externo quando o campo NÃO
  // está sendo editado agora (ex: trocou de produto no formulário) — assim
  // não atropela o que a pessoa está digitando no meio da vírgula.
  useEffect(() => {
    if (!focusedRef.current) setText(formatDecimalForEdit(value));
  }, [value]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    let raw = e.target.value.replace(/[^\d.,-]/g, "");
    if (!allowNegative) raw = raw.replace(/-/g, "");

    const firstSep = raw.search(/[.,]/);
    if (firstSep !== -1) {
      raw = raw.slice(0, firstSep + 1) + raw.slice(firstSep + 1).replace(/[.,]/g, "");
    }

    setText(raw);
    const parsed = parseFloat(raw.replace(",", "."));
    onValueChange(Number.isFinite(parsed) ? parsed : 0);
  }

  return (
    <div>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={handleChange}
        onFocus={(e) => {
          focusedRef.current = true;
          selectAll.handleFocus(e);
        }}
        onMouseUp={selectAll.handleMouseUp}
        onBlur={() => {
          focusedRef.current = false;
          setText(formatDecimalForEdit(value));
        }}
        className={cn(
          "h-10 w-full rounded-xl border bg-surface px-3 text-sm text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent",
          error ? "border-danger" : "border-border",
          className
        )}
        {...props}
      />
      {name && <input type="hidden" name={name} value={Number.isFinite(value) ? value : 0} />}
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

export function MoneyInput({
  name,
  value,
  onValueChange,
  error,
  className,
  ...props
}: {
  name?: string;
  value: number;
  onValueChange: (value: number) => void;
  error?: string;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "name" | "type">) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
        R$
      </span>
      <DecimalInput
        name={name}
        value={value}
        onValueChange={onValueChange}
        error={error}
        className={cn("pl-9", className)}
        {...props}
      />
    </div>
  );
}

export function PercentInput({
  name,
  value,
  onValueChange,
  error,
  className,
  ...props
}: {
  name?: string;
  value: number;
  onValueChange: (value: number) => void;
  error?: string;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "name" | "type">) {
  return (
    <div className="relative">
      <DecimalInput
        name={name}
        value={value}
        onValueChange={onValueChange}
        error={error}
        className={cn("pr-8", className)}
        {...props}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">
        %
      </span>
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
