import type { AdminDto } from '@abis/shared';
import { useState } from 'react';
import { ApiRequestError, apiFetch } from '../api';
import { Field } from '../ui';
import { useLoad } from '../useLoad';

export function AdminsSection() {
  const { data, error, reload } = useLoad<AdminDto[]>('/admins');
  const [telegramId, setTelegramId] = useState('');
  const [message, setMessage] = useState<string>();

  async function call(run: () => Promise<unknown>) {
    setMessage(undefined);
    try {
      await run();
      reload();
    } catch (err) {
      setMessage(
        err instanceof ApiRequestError && err.body?.message ? err.body.message : String(err),
      );
    }
  }

  return (
    <article className="card">
      <h3>👥 ادمین‌ها</h3>
      {error && <p className="error">{error}</p>}
      {data?.map((admin) => (
        <div key={admin.telegramId} className="card-header">
          <span>
            {admin.name ?? 'نام نامشخص'} <code>{admin.telegramId}</code>
            {admin.isOwner && <span className="badge">مالک</span>}
          </span>
          {!admin.isOwner && (
            <button
              type="button"
              className="ghost"
              onClick={() =>
                window.confirm('این ادمین حذف شود؟') &&
                void call(() => apiFetch(`/admins/${admin.telegramId}`, { method: 'DELETE' }))
              }
            >
              🗑
            </button>
          )}
        </div>
      ))}
      <Field
        label="افزودن ادمین با شناسه‌ی عددی تلگرام"
        hint="شناسه را از ‎@userinfobot بگیرید. ادمین جدید باید یک بار ربات را استارت کند تا اعلان‌ها را دریافت کند."
      >
        <div className="row">
          <input
            inputMode="numeric"
            dir="ltr"
            value={telegramId}
            onChange={(e) => setTelegramId(e.target.value.replace(/\D/g, ''))}
          />
          <button
            type="button"
            disabled={!telegramId}
            onClick={() =>
              void call(async () => {
                await apiFetch('/admins', {
                  method: 'POST',
                  body: JSON.stringify({ telegramId: Number(telegramId) }),
                });
                setTelegramId('');
              })
            }
          >
            افزودن
          </button>
        </div>
      </Field>
      {message && <p className="error">{message}</p>}
    </article>
  );
}
