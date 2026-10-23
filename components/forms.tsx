"use client";
import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: (id: string, describedBy: string | undefined) => ReactNode }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id, [hintId, errId].filter(Boolean).join(" ") || undefined)}
      {hint && <span id={hintId} className="hint">{hint}</span>}
      {error && <span id={errId} className="err" role="alert">{error}</span>}
    </div>
  );
}

export function TextField({ label, hint, error, ...props }: { label: string; hint?: ReactNode; error?: string | null } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, d) => <input id={id} className="input" aria-describedby={d} aria-invalid={error ? true : undefined} {...props} />}
    </Field>
  );
}
