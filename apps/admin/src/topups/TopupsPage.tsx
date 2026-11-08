import {
  type TopupDto,
  type TopupStatus,
  formatToman,
  toman,
  topupRejectReasons,
} from '@abis/shared';
import { useState } from 'react';
import { ApiRequestError, apiFetch, apiFetchBlob } from '../api';
import { Field, Modal, fa, formatDateTime } from '../ui';
import { useLoad } from '../useLoad';

const statusTabs: { id: TopupStatus; label: string }[] = [
  { id: 'pending', label: 'در انتظار' },
  { id: 'approved', label: 'تأییدشده' },
  { id: 'rejected', label: 'ردشده' },
];

export function TopupsPage() {
  const [status, setStatus] = useState<TopupStatus>('pending');
  const { data, error, reload } = useLoad<TopupDto[]>(`/topups?status=${status}`);
  const [deciding, setDeciding] = useState<{ topup: TopupDto; mode: 'approve' | 'reject' }>();

  return (
    <section>
      <nav className="tabs small">
        {statusTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={t.id === status ? 'active' : ''}
            onClick={() => setStatus(t.id)}
          >
            {t.label}
          </button>
        ))}
        <button type="button" className="ghost" onClick={reload} aria-label="به‌روزرسانی">
          🔄
        </button>
      </nav>

      {error && <p className="error">{error}</p>}
      {data?.length === 0 && <p className="muted">موردی نیست.</p>}

      {data?.map((topup) => (
        <article key={topup.id} className="card">
          <header className="card-header">
            <strong>
              #{fa(topup.id)} · {formatToman(toman(topup.claimedAmountToman))}
            </strong>
            <small className="muted">{formatDateTime(topup.createdAt)}</small>
          </header>
          <div>
            👤 {topup.customer.firstName}
            {topup.customer.username && <> (@{topup.customer.username})</>}
            {' · '}
            <span dir="ltr">{topup.customer.phone ?? 'بدون شماره'}</span>
          </div>
          <div className="muted">🏦 {topup.bankCardLabel}</div>
          {topup.duplicateOfTopupId && (
            <p className="warning">
              ⚠️ این تصویر قبلاً در درخواست #{fa(topup.duplicateOfTopupId)} ارسال شده
            </p>
          )}
          <Receipt topupId={topup.id} />

          {topup.status === 'pending' ? (
            <div className="row">
              <button type="button" onClick={() => setDeciding({ topup, mode: 'approve' })}>
                ✅ تأیید
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => setDeciding({ topup, mode: 'reject' })}
              >
                ❌ رد
              </button>
            </div>
          ) : (
            <p className="muted">
              {topup.status === 'approved'
                ? `✅ ${formatToman(toman(topup.approvedAmountToman ?? 0))} توسط ${topup.handledBy ?? '?'}`
                : `❌ ${topup.rejectReason ?? ''} — ${topup.handledBy ?? '?'}`}
            </p>
          )}
        </article>
      ))}

      {deciding && (
        <DecisionDialog
          {...deciding}
          onClose={() => setDeciding(undefined)}
          onDone={() => {
            setDeciding(undefined);
            reload();
          }}
        />
      )}
    </section>
  );
}

function Receipt(props: { topupId: number }) {
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  if (url) return <img className="receipt" src={url} alt="رسید" />;
  return (
    <button
      type="button"
      className="ghost"
      onClick={() =>
        apiFetchBlob(`/topups/${props.topupId}/receipt`)
          .then((blob) => setUrl(URL.createObjectURL(blob)))
          .catch(() => setFailed(true))
      }
    >
      {failed ? 'دریافت رسید ناموفق بود؛ دوباره' : '🖼 نمایش رسید'}
    </button>
  );
}

function DecisionDialog(props: {
  topup: TopupDto;
  mode: 'approve' | 'reject';
  onClose: () => void;
  onDone: () => void;
}) {
  const { topup, mode } = props;
  const [amount, setAmount] = useState(String(topup.claimedAmountToman));
  const [reason, setReason] = useState<string>(topupRejectReasons[0]);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      if (mode === 'approve') {
        const amountToman = Number(amount);
        await apiFetch(`/topups/${topup.id}/approve`, {
          method: 'POST',
          body: JSON.stringify(amountToman === topup.claimedAmountToman ? {} : { amountToman }),
        });
      } else {
        await apiFetch(`/topups/${topup.id}/reject`, {
          method: 'POST',
          body: JSON.stringify({ reason: reason === 'other' ? custom : reason }),
        });
      }
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
    <Modal
      title={`${mode === 'approve' ? 'تأیید' : 'رد'} شارژ #${fa(topup.id)}`}
      onClose={props.onClose}
    >
      {mode === 'approve' ? (
        <Field
          label="مبلغ قابل شارژ (تومان)"
          hint="اگر مبلغ واریزی با مبلغ اعلامی فرق دارد، اصلاح کنید"
        >
          <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      ) : (
        <Field label="دلیل رد (برای مشتری ارسال می‌شود)">
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {topupRejectReasons.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            <option value="other">دلیل دیگر…</option>
          </select>
          {reason === 'other' && (
            <textarea rows={3} value={custom} onChange={(e) => setCustom(e.target.value)} />
          )}
        </Field>
      )}
      {error && <p className="error">{error}</p>}
      <footer className="modal-actions">
        <button
          type="button"
          className={mode === 'reject' ? 'danger' : ''}
          disabled={busy}
          onClick={() => void submit()}
        >
          {mode === 'approve' ? `تأیید ${formatToman(toman(Number(amount) || 0))}` : 'رد درخواست'}
        </button>
        <button type="button" className="ghost" onClick={props.onClose}>
          انصراف
        </button>
      </footer>
    </Modal>
  );
}
