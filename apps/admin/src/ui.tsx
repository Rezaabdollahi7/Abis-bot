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

const monthWords: Record<number, string> = {
  1: 'یک ماهه',
  2: 'دو ماهه',
  3: 'سه ماهه',
  4: 'چهار ماهه',
  6: 'شش ماهه',
  12: 'یک ساله',
};

export function formatDuration(days: number): string {
  if (days % 30 !== 0) return `${fa(days)} روزه`;
  return monthWords[days / 30] ?? `${fa(days / 30)} ماهه`;
}

const dateTime = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
