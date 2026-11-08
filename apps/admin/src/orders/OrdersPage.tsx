import { type OrderDto, type OrderStatus, formatToman, toman } from '@abis/shared';
import { useState } from 'react';
import { ApiRequestError, apiFetch } from '../api';
import { Field, Modal, fa, formatDateTime } from '../ui';
import { useLoad } from '../useLoad';

const statusTabs: { id: OrderStatus; label: string }[] = [
  { id: 'queued', label: 'در صف تحویل' },
  { id: 'delivered', label: 'تحویل‌شده' },
  { id: 'rejected', label: 'ردشده' },
];

const inputLabels = { email: '📧 ایمیل', password: '🔑 رمز', note: '📝 توضیح' } as const;

export function OrdersPage() {
  const [status, setStatus] = useState<OrderStatus>('queued');
  const { data, error, reload } = useLoad<OrderDto[]>(`/orders?status=${status}`);
  const [deciding, setDeciding] = useState<{ order: OrderDto; mode: 'deliver' | 'reject' }>();

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

      {data?.map((order) => (
        <article key={order.id} className="card">
          <header className="card-header">
            <strong>سفارش #{fa(order.id)}</strong>
            <small className="muted">{formatDateTime(order.createdAt)}</small>
          </header>
          <div>
            <bdi>{order.productLine}</bdi>
            {order.quantity > 1 && ` × ${fa(order.quantity)}`}
          </div>
          <div>
            👤 {order.customer.firstName}
            {order.customer.username && <> (@{order.customer.username})</>} ·{' '}
            {formatToman(toman(order.totalToman))}
          </div>
          {order.deliveryMethod !== 'email_activation' && order.status === 'queued' && (
            <p className="warning">⚠️ انبار خالی بود؛ لینک/اکانت را دستی بفرستید</p>
          )}
          {Object.entries(order.input).map(([key, value]) => (
            <div key={key}>
              {inputLabels[key as keyof typeof inputLabels]}:{' '}
              <code
                dir="ltr"
                className="copyable"
                onClick={() => void navigator.clipboard?.writeText(value)}
              >
                {value}
              </code>
            </div>
          ))}

          {order.status === 'queued' ? (
            <div className="row">
              <button type="button" onClick={() => setDeciding({ order, mode: 'deliver' })}>
                📦 تحویل
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => setDeciding({ order, mode: 'reject' })}
              >
                ❌ رد و بازپرداخت
              </button>
            </div>
          ) : (
            <p className="muted">
              {order.status === 'delivered'
                ? `✅ ${order.handledBy ? `توسط ${order.handledBy}` : 'خودکار'}${order.deliveredAt ? ` · ${formatDateTime(order.deliveredAt)}` : ''}`
                : `❌ ${order.rejectReason ?? ''} — ${order.handledBy ?? '?'}`}
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

function DecisionDialog(props: {
  order: OrderDto;
  mode: 'deliver' | 'reject';
  onClose: () => void;
  onDone: () => void;
}) {
  const { order, mode } = props;
  const [text, setText] = useState(
    mode === 'deliver' && order.deliveryMethod === 'email_activation'
      ? 'اشتراک روی ایمیل شما فعال شد. لطفاً وارد حساب خود شوید و بررسی کنید.'
      : '',
  );
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      await apiFetch(`/orders/${order.id}/${mode}`, {
        method: 'POST',
        body: JSON.stringify(mode === 'deliver' ? { note: text } : { reason: text }),
      });
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
      title={`${mode === 'deliver' ? 'تحویل' : 'رد'} سفارش #${fa(order.id)}`}
      onClose={props.onClose}
    >
      <Field
        label={mode === 'deliver' ? 'پیام تحویل برای مشتری' : 'دلیل رد (برای مشتری ارسال می‌شود)'}
        hint={
          mode === 'deliver'
            ? 'لینک، مشخصات اکانت یا توضیح فعال‌سازی. رمزنگاری‌شده ذخیره می‌شود.'
            : `مبلغ ${formatToman(toman(order.totalToman))} به کیف پول مشتری برمی‌گردد.`
        }
      >
        <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      {error && <p className="error">{error}</p>}
      <footer className="modal-actions">
        <button
          type="button"
          className={mode === 'reject' ? 'danger' : ''}
          disabled={busy || text.trim().length < (mode === 'reject' ? 3 : 1)}
          onClick={() => void submit()}
        >
          {mode === 'deliver' ? 'ارسال و تحویل' : 'رد و بازپرداخت'}
        </button>
        <button type="button" className="ghost" onClick={props.onClose}>
          انصراف
        </button>
      </footer>
    </Modal>
  );
}
