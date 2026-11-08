import type { BroadcastDto } from '@abis/shared';
import { useEffect, useState } from 'react';
import { ApiRequestError, apiFetch } from '../api';
import { Field, fa, formatDateTime } from '../ui';
import { useLoad } from '../useLoad';

export function BroadcastPage() {
  const { data, error, reload } = useLoad<BroadcastDto[]>('/broadcasts');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const sending = data?.some((b) => b.status === 'sending') ?? false;

  // Poll while a broadcast is in progress.
  useEffect(() => {
    if (!sending) return;
    const timer = setInterval(reload, 3000);
    return () => clearInterval(timer);
  }, [sending, reload]);

  async function send() {
    if (!window.confirm('این پیام برای همه‌ی کاربران ارسال شود؟')) return;
    setBusy(true);
    setMessage(undefined);
    try {
      await apiFetch('/broadcasts', { method: 'POST', body: JSON.stringify({ text }) });
      setText('');
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
    <section>
      <article className="card">
        <Field label="📣 پیام همگانی" hint="برای همه‌ی کاربران به جز مسدودشده‌ها ارسال می‌شود">
          <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <button
          type="button"
          disabled={busy || sending || !text.trim()}
          onClick={() => void send()}
        >
          {sending ? 'یک ارسال در جریان است…' : 'ارسال برای همه'}
        </button>
        {message && <p className="error">{message}</p>}
      </article>

      {error && <p className="error">{error}</p>}
      {data?.map((b) => (
        <article key={b.id} className="card">
          <header className="card-header">
            <small className="muted">{formatDateTime(b.createdAt)}</small>
            <span>
              {b.status === 'sending' ? '⏳ در حال ارسال' : '✅ تمام شد'} · {fa(b.sent)} از{' '}
              {fa(b.total)}
              {b.failed > 0 && <span className="muted"> ({fa(b.failed)} ناموفق)</span>}
            </span>
          </header>
          <progress max={b.total || 1} value={b.sent + b.failed} />
          <div className="pre-wrap">{b.text}</div>
        </article>
      ))}
    </section>
  );
}
