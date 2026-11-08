import type { AuditEntryDto } from '@abis/shared';
import { formatDateTime } from '../ui';
import { useLoad } from '../useLoad';

const actionLabels: Record<string, string> = {
  'topup.approve': 'تأیید شارژ',
  'topup.reject': 'رد شارژ',
  'wallet.adjust': 'اصلاح موجودی',
  'settings.update': 'تغییر تنظیمات',
  'bank_card.create': 'افزودن کارت',
  'bank_card.activate': 'تغییر کارت فعال',
  'provider.create': 'افزودن شرکت',
  'provider.update': 'ویرایش شرکت',
  'product.create': 'افزودن محصول',
  'product.update': 'ویرایش محصول',
  'variant.create': 'افزودن مدت',
  'variant.update': 'ویرایش مدت/قیمت',
  'stock.add': 'افزودن به انبار',
  'stock.remove': 'حذف از انبار',
  'order.deliver': 'تحویل سفارش',
  'order.reject': 'رد سفارش و بازپرداخت',
  'order.warranty_refund': 'بازپرداخت گارانتی',
  'ticket.reply': 'پاسخ تیکت',
  'ticket.close': 'بستن تیکت',
  'customer.ban': 'مسدود کردن کاربر',
  'customer.unban': 'رفع مسدودیت',
  'customer.message': 'پیام مستقیم',
  'broadcast.send': 'پیام همگانی',
};

export function AuditPage() {
  const { data, error } = useLoad<AuditEntryDto[]>('/audit');
  return (
    <section>
      {error && <p className="error">{error}</p>}
      {data?.length === 0 && <p className="muted">هنوز اقدامی ثبت نشده.</p>}
      <table>
        <tbody>
          {data?.map((e) => (
            <tr key={e.id}>
              <td className="muted">{formatDateTime(e.createdAt)}</td>
              <td>{e.admin}</td>
              <td>
                {actionLabels[e.action] ?? e.action} #{e.entityId}
                <details>
                  <summary className="muted">جزئیات</summary>
                  <pre dir="ltr">{JSON.stringify(e.data, null, 2)}</pre>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
