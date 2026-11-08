import type { DeliveryMethod, StockItemDto } from '@abis/shared';
import { useState } from 'react';
import { ApiRequestError, apiFetch } from '../api';
import { Field, Modal, fa, formatDateTime } from '../ui';
import { useLoad } from '../useLoad';

export function StockDialog(props: {
  variantId: number;
  title: string;
  deliveryMethod: DeliveryMethod;
  onClose: () => void;
}) {
  const { data, error, reload } = useLoad<StockItemDto[]>(`/variants/${props.variantId}/stock`);
  const [text, setText] = useState('');
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const isLink = props.deliveryMethod === 'link';
  const available = data?.filter((i) => i.status === 'available') ?? [];

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setMessage(undefined);
    try {
      setMessage(await action());
      reload();
    } catch (err) {
      setMessage(
        err instanceof ApiRequestError && err.body?.message ? err.body.message : String(err),
      );
    } finally {
      setBusy(false);
    }
  }

  const add = () =>
    run(async () => {
      const res = await apiFetch<{ added: number }>(`/variants/${props.variantId}/stock`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      setText('');
      return `✅ ${fa(res.added)} آیتم اضافه شد`;
    });

  const remove = (id: number) =>
    run(async () => {
      await apiFetch(`/stock/${id}`, { method: 'DELETE' });
      return '🗑 حذف شد';
    });

  return (
    <Modal title={`انبار ${props.title}`} onClose={props.onClose}>
      <p>
        📦 موجود: <strong>{fa(available.length)}</strong> · فروخته‌شده:{' '}
        {fa((data?.length ?? 0) - available.length)}
      </p>
      <Field
        label="افزودن گروهی"
        hint={
          isLink
            ? 'هر لینک در یک خط'
            : 'هر اکانت (مثلاً ایمیل و رمز در دو خط) با یک خط خالی از بعدی جدا شود'
        }
      >
        <textarea
          rows={6}
          dir="ltr"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            isLink ? 'https://...\nhttps://...' : 'mail1@x.com\npass1\n\nmail2@x.com\npass2'
          }
        />
      </Field>
      <button type="button" disabled={busy || !text.trim()} onClick={() => void add()}>
        افزودن به انبار
      </button>
      {message && <p>{message}</p>}
      {error && <p className="error">{error}</p>}

      <h3>آیتم‌ها</h3>
      <p className="muted">محتوای کامل برای امنیت نمایش داده نمی‌شود.</p>
      <table>
        <tbody>
          {data?.map((item) => (
            <tr key={item.id} className={item.status === 'sold' ? 'inactive' : ''}>
              <td dir="ltr" className="mono">
                {item.preview}
              </td>
              <td>{item.status === 'sold' ? `فروخته‌شده #${fa(item.orderId ?? 0)}` : 'موجود'}</td>
              <td className="muted">{formatDateTime(item.createdAt)}</td>
              <td>
                {item.status === 'available' && (
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy}
                    onClick={() => void remove(item.id)}
                  >
                    🗑
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
