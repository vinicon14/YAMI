import type { ReactNode } from "react";

export function Card({
  title,
  actions,
  children,
  wide,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}): React.JSX.Element {
  return (
    <article className={`card${wide ? " card-wide" : ""}`}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </article>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger" | "accent";
}): React.JSX.Element {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <label className={`switch${disabled ? " is-disabled" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      <span>{label}</span>
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }): React.JSX.Element {
  return <p className="empty">{children}</p>;
}

export function Spinner(): React.JSX.Element {
  return <span className="spinner" aria-label="Carregando" />;
}
