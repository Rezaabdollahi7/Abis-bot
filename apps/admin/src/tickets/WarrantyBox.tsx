import { type WarrantyDto, formatToman, toman } from '@abis/shared';
import { useEffect, useState } from 'react';
import { ApiRequestError, apiFetch } from '../api';
import { Field, formatDateTime } from '../ui';
import { useLoad } from '../useLoad';

/** Warranty status of the order a ticket is about, with a one-time prorated refund. */
export function WarrantyBox(props: { orderId: number }) {
  const { data: w, error, reload } = useLoad<WarrantyDto>(`/orders/${props.orderId}/warranty`);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('اکانت در دوره‌ی گارانتی از کار افتاد');
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (w) setAmount(String(w.suggestedRefundToman));
  }, [w]);

  if (error) return <p className="error">{error}</p>;
  if (!w) return null;

  async function refund() {
    setBusy(true);
    setMessage(undefined);
    try {
      await apiFetch(`/orders/${props.orderId}/warranty-refund`, {
        method: 'POST',
        body: JSON.stringify({ amountToman: Number(amount), reason }),
      });
      setMessage('✅ بازپرداخت انجام شد و به مشتری اطلاع داده شد');
      reload();
    } catch (err) {
      setMessage(
        err instanceof ApiRequestError && err.body?.message ? err.body.message : String(err),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="card">
      <summary>
        🛡 گارانتی:{' '}
        {w.alreadyRefunded
          ? 'بازپرداخت شده'
          : w.underWarranty
            ? `فعال تا ${formatDateTime(w.warrantyEndsAt ?? '')}`
            : w.warrantyEndsAt
              ? 'تمام شده'
              : 'سفارش تحویل نشده'}
      </summary>
      {w.status === 'delivered' && !w.alreadyRefunded && (
        <>
          <p className="muted">
            جایگزینی: مشخصات جدید را در همین تیکت برای مشتری بفرستید. بازپرداخت: سهم استفاده‌نشده
            (پیشنهادی: {formatToman(toman(w.suggestedRefundToman))} از{' '}
            {formatToman(toman(w.totalToman))}).
          </p>
          {!w.underWarranty && <p className="warning">⚠️ دوره‌ی گارانتی تمام شده است</p>}
          <Field label="مبلغ بازپرداخت (تومان)">
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="دلیل (برای مشتری ارسال می‌شود)">
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <button type="button" disabled={busy || !Number(amount)} onClick={() => void refund()}>
            بازپرداخت به کیف پول
          </button>
        </>
      )}
      {message && <p>{message}</p>}
    </details>
  );
}
