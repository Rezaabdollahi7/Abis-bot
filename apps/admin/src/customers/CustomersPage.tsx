import {
  type CustomerProfileDto,
  type CustomerSummaryDto,
  type LedgerKind,
  adjustmentInput,
  formatToman,
  toman,
} from '@abis/shared';
import { useEffect, useState } from 'react';
import { ApiRequestError, apiFetch } from '../api';
import { Field, Modal, fa, formatDateTime } from '../ui';
import { useLoad } from '../useLoad';

const kindLabels: Record<LedgerKind, string> = {
  topup: 'شارژ',
  purchase: 'خرید',
  refund: 'برگشت خورده',
  adjustment: 'اصلاحیه',
};

export function CustomersPage() {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const { data, error, reload } = useLoad<CustomerSummaryDto[]>(
    `/customers?q=${encodeURIComponent(debounced)}`,
  );
  const [openId, setOpenId] = useState<number>();

  return (
    <section>
      <input
        className="search"
        placeholder="جست‌وجو: نام، @یوزرنیم، موبایل یا شناسه"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && <p className="error">{error}</p>}
      {data?.length === 0 && <p className="muted">کاربری پیدا نشد.</p>}
      {data?.map((c) => (
        <button key={c.id} type="button" className="list-item" onClick={() => setOpenId(c.id)}>
          <span>
            <strong>{c.firstName}</strong>{' '}
            {c.username && <span className="muted">@{c.username}</span>}
            {c.isBanned && <span className="tag">مسدود</span>}
            <br />
            <small className="muted" dir="ltr">
              {c.phone ?? '—'}
            </small>
          </span>
          <span>{formatToman(toman(c.balanceToman))}</span>
        </button>
      ))}
      {openId !== undefined && (
        <CustomerDialog
          id={openId}
          onClose={() => {
            setOpenId(undefined);
            reload();
          }}
        />
      )}
    </section>
  );
}

function CustomerDialog(props: { id: number; onClose: () => void }) {
  const { data: c, error, reload } = useLoad<CustomerProfileDto>(`/customers/${props.id}`);
  return (
    <Modal title={c ? c.firstName : 'کاربر'} onClose={props.onClose}>
      {error && <p className="error">{error}</p>}
      {c && (
        <>
          <p>
            {c.username && <>@{c.username} · </>}
            <span dir="ltr">{c.phone ?? 'بدون شماره'}</span> · شناسه <code>{c.telegramId}</code>
          </p>
          <p className="muted">
            عضویت {formatDateTime(c.createdAt)} · آخرین فعالیت {formatDateTime(c.lastSeenAt)}
          </p>
          <h3>💰 موجودی: {formatToman(toman(c.balanceToman))}</h3>
          <AdjustmentForm customerId={c.id} onDone={reload} />
          <DirectMessageForm customerId={c.id} />
          <BanToggle customerId={c.id} banned={c.isBanned} onDone={reload} />
          <h3>🧾 تراکنش‌ها</h3>
          {c.ledger.length === 0 && <p className="muted">تراکنشی ثبت نشده.</p>}
          <table>
            <tbody>
              {c.ledger.map((e) => (
                <tr key={e.id}>
                  <td className={e.amountToman > 0 ? 'positive' : 'negative'}>
                    {e.amountToman > 0 ? '+' : '−'}
                    {fa(Math.abs(e.amountToman))}
                  </td>
                  <td>
                    {kindLabels[e.kind]}
                    {e.reason && <small className="muted"> — {e.reason}</small>}
                  </td>
                  <td className="muted">{formatDateTime(e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Modal>
  );
}

function AdjustmentForm(props: { customerId: number; onDone: () => void }) {
  const [direction, setDirection] = useState<1 | -1>(1);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit() {
    const input = { amountToman: direction * Number(amount), reason };
    const parsed = adjustmentInput.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'مقادیر معتبر نیستند');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await apiFetch(`/customers/${props.customerId}/adjustments`, {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      setAmount('');
      setReason('');
      props.onDone();
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.body?.message ? err.body.message : String(err),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="card">
      <summary>اصلاح دستی موجودی</summary>
      <div className="row">
        <select
          value={direction}
          onChange={(e) => setDirection(Number(e.target.value) === -1 ? -1 : 1)}
        >
          <option value={1}>➕ افزایش</option>
          <option value={-1}>➖ کاهش (مثلاً تسویه به کارت)</option>
        </select>
        <input
          type="number"
          min={1}
          placeholder="مبلغ (تومان)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <Field label="دلیل (برای مشتری هم ارسال می‌شود)">
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {error && <p className="error">{error}</p>}
      <button type="button" disabled={busy} onClick={() => void submit()}>
        ثبت
      </button>
    </details>
  );
}

function DirectMessageForm(props: { customerId: number }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<string>();
  async function send() {
    setStatus(undefined);
    try {
      await apiFetch(`/customers/${props.customerId}/message`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      setText('');
      setStatus('✅ ارسال شد');
    } catch (err) {
      setStatus(
        err instanceof ApiRequestError && err.body?.message ? err.body.message : String(err),
      );
    }
  }
  return (
    <details className="card">
      <summary>📬 ارسال پیام مستقیم</summary>
      <textarea
        className="reply-box"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="button" disabled={!text.trim()} onClick={() => void send()}>
        ارسال
      </button>
      {status && <p>{status}</p>}
    </details>
  );
}

function BanToggle(props: { customerId: number; banned: boolean; onDone: () => void }) {
  async function toggle() {
    const question = props.banned ? 'رفع مسدودیت این کاربر؟' : 'این کاربر مسدود شود؟';
    if (!window.confirm(question)) return;
    await apiFetch(`/customers/${props.customerId}/ban`, {
      method: 'POST',
      body: JSON.stringify({ banned: !props.banned }),
    });
    props.onDone();
  }
  return (
    <button type="button" className={props.banned ? '' : 'danger'} onClick={() => void toggle()}>
      {props.banned ? '✅ رفع مسدودیت' : '🚫 مسدود کردن'}
    </button>
  );
}
