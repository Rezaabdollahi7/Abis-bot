import type { ReactNode } from 'react';

export function Modal(props: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h2>{props.title}</h2>
          <button type="button" className="ghost" onClick={props.onClose} aria-label="بستن">
            ✕
          </button>
        </header>
        {props.children}
      </div>
    </div>
  );
}

export function Field(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      {props.children}
      {props.hint && <small className="muted">{props.hint}</small>}
    </label>
  );
}

export function Toggle(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      {props.label}
    </label>
  );
}

const faNumber = new Intl.NumberFormat('fa-IR');
export const fa = (n: number) => faNumber.format(n);

export function formatDuration(days: number): string {
  return days % 30 === 0 ? `${fa(days / 30)} ماهه` : `${fa(days)} روزه`;
}
