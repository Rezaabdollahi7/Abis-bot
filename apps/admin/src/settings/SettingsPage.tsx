import { type SettingsPatch, type SettingsResponse, bankCardInput } from '@abis/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { Field, Modal, Toggle } from '../ui';

export function formatCardNumber(number: string): string {
  return number.replace(/(\d{4})(?=\d)/g, '$1-');
}

export function SettingsPage() {
  const [data, setData] = useState<SettingsResponse>();
  const [error, setError] = useState<string>();
  const [addingCard, setAddingCard] = useState(false);

  const load = useCallback(() => {
    apiFetch<SettingsResponse>('/settings')
      .then(setData)
      .catch((err: unknown) => setError(String(err)));
  }, []);
  useEffect(load, [load]);

  async function call(path: string, method: string, body: unknown) {
    setError(undefined);
    try {
      setData(await apiFetch<SettingsResponse>(path, { method, body: JSON.stringify(body) }));
    } catch (err) {
      setError(String(err));
      load();
    }
  }
  const patch = (value: SettingsPatch) => void call('/settings', 'PATCH', value);

  if (!data)
    return error ? <p className="error">{error}</p> : <p className="muted">در حال بارگذاری…</p>;
  const { settings, bankCards } = data;

  return (
    <section>
      {error && <p className="error">{error}</p>}

      <article className="card">
        <header className="card-header">
          <h3>💳 کارت‌های بانکی</h3>
          <button type="button" className="ghost" onClick={() => setAddingCard(true)}>
            + کارت
          </button>
        </header>
        <p className="muted">
          کارت فعال به مشتری‌ها برای کارت به کارت نمایش داده می‌شود. بدون کارت فعال، شارژ کیف پول
          غیرفعال است.
        </p>
        {bankCards.map((card) => (
          <div key={card.id} className="card-header">
            <div>
              <div dir="ltr" className="mono">
                {formatCardNumber(card.number)}
              </div>
              <small className="muted">
                {card.holderName} · {card.bankName}
              </small>
            </div>
            {card.isActive ? (
              <button
                type="button"
                className="ghost"
                onClick={() => void call('/bank-cards/active', 'PUT', { cardId: null })}
              >
                ✅ فعال
              </button>
            ) : (
              <button
                type="button"
                className="ghost"
                onClick={() => void call('/bank-cards/active', 'PUT', { cardId: card.id })}
              >
                فعال کن
              </button>
            )}
          </div>
        ))}
      </article>

      <article className="card">
        <h3>💰 محدوده‌ی شارژ (تومان)</h3>
        <LimitInput
          label="حداقل"
          value={settings.topupMinToman}
          onSave={(topupMinToman) => patch({ topupMinToman })}
        />
        <LimitInput
          label="حداکثر"
          value={settings.topupMaxToman}
          onSave={(topupMaxToman) => patch({ topupMaxToman })}
        />
      </article>

      <article className="card">
        <h3>📦 انبار</h3>
        <LimitInput
          label="هشدار کمبود موجودی وقتی به این تعداد رسید"
          value={settings.lowStockThreshold}
          onSave={(lowStockThreshold) => patch({ lowStockThreshold })}
        />
      </article>

      <article className="card">
        <h3>⚙️ رفتار ربات</h3>
        <Toggle
          label="عضویت اجباری در کانال"
          checked={settings.forcedJoin}
          onChange={(forcedJoin) => patch({ forcedJoin })}
        />
        <br />
        <Toggle
          label="دریافت شماره موبایل قبل از اولین شارژ"
          checked={settings.requirePhone}
          onChange={(requirePhone) => patch({ requirePhone })}
        />
      </article>

      {addingCard && (
        <AddCardForm
          onClose={() => setAddingCard(false)}
          onSubmit={async (card) => {
            await call('/bank-cards', 'POST', card);
            setAddingCard(false);
          }}
        />
      )}
    </section>
  );
}

function LimitInput(props: { label: string; value: number; onSave: (value: number) => void }) {
  const [value, setValue] = useState(String(props.value));
  useEffect(() => setValue(String(props.value)), [props.value]);
  const dirty = Number(value) !== props.value;
  return (
    <Field label={props.label}>
      <div className="row">
        <input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} />
        {dirty && (
          <button type="button" onClick={() => props.onSave(Number(value))}>
            ذخیره
          </button>
        )}
      </div>
    </Field>
  );
}

function AddCardForm(props: {
  onClose: () => void;
  onSubmit: (card: { number: string; holderName: string; bankName: string }) => Promise<void>;
}) {
  const [card, setCard] = useState({ number: '', holderName: '', bankName: '' });
  const [error, setError] = useState<string>();

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = bankCardInput.safeParse(card);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'اطلاعات کارت معتبر نیست');
      return;
    }
    void props.onSubmit(card);
  }

  return (
    <Modal title="کارت جدید" onClose={props.onClose}>
      <form onSubmit={submit}>
        <Field label="شماره کارت">
          <input
            dir="ltr"
            inputMode="numeric"
            value={card.number}
            onChange={(e) => setCard({ ...card, number: e.target.value })}
          />
        </Field>
        <Field label="نام صاحب کارت">
          <input
            value={card.holderName}
            onChange={(e) => setCard({ ...card, holderName: e.target.value })}
          />
        </Field>
        <Field label="بانک">
          <input
            value={card.bankName}
            onChange={(e) => setCard({ ...card, bankName: e.target.value })}
          />
        </Field>
        {error && <p className="error">{error}</p>}
        <footer className="modal-actions">
          <button type="submit">افزودن</button>
          <button type="button" className="ghost" onClick={props.onClose}>
            انصراف
          </button>
        </footer>
      </form>
    </Modal>
  );
}
