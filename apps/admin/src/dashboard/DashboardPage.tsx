import { type DashboardDto, type PeriodStatsDto, formatToman, toman } from '@abis/shared';
import { fa } from '../ui';
import { useLoad } from '../useLoad';

export function DashboardPage(props: { goTo?: (tab: string) => void }) {
  const { data, error, reload } = useLoad<DashboardDto>('/dashboard');
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">در حال بارگذاری…</p>;
  const { pending } = data;

  return (
    <section>
      <div className="stat-row">
        <PendingTile
          label="واریز در انتظار"
          count={pending.topups}
          onClick={() => props.goTo?.('topups')}
        />
        <PendingTile
          label="سفارش در صف"
          count={pending.orders}
          onClick={() => props.goTo?.('orders')}
        />
        <PendingTile
          label="تیکت بی‌پاسخ"
          count={pending.tickets}
          onClick={() => props.goTo?.('tickets')}
        />
      </div>

      <Period title="امروز" stats={data.today} />
      <Period title="۷ روز اخیر" stats={data.week} />
      <Period title="۳۰ روز اخیر" stats={data.month} />

      <article className="card">
        <h3>📦 موجودی رو به اتمام</h3>
        {data.lowStock.length === 0 ? (
          <p className="muted">همه‌چیز موجود است.</p>
        ) : (
          data.lowStock.map((item) => (
            <div key={item.variantId} className="card-header">
              <bdi>{item.line}</bdi>
              <strong className={item.stock === 0 ? 'negative' : 'warning'}>
                {fa(item.stock)}
              </strong>
            </div>
          ))
        )}
      </article>
      <button type="button" className="ghost" onClick={reload}>
        🔄 به‌روزرسانی
      </button>
    </section>
  );
}

function PendingTile(props: { label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`stat ${props.count > 0 ? 'attention' : ''}`}
      onClick={props.onClick}
    >
      <strong>{fa(props.count)}</strong>
      <small>{props.label}</small>
    </button>
  );
}

function Period(props: { title: string; stats: PeriodStatsDto }) {
  const { sales, topups, newCustomers } = props.stats;
  return (
    <article className="card">
      <h3>{props.title}</h3>
      <div className="card-header">
        <span>🛒 فروش ({fa(sales.count)} سفارش)</span>
        <strong>{formatToman(toman(sales.total))}</strong>
      </div>
      <div className="card-header">
        <span>💳 شارژ تأییدشده ({fa(topups.count)})</span>
        <strong>{formatToman(toman(topups.total))}</strong>
      </div>
      <div className="card-header">
        <span>👤 کاربران جدید</span>
        <strong>{fa(newCustomers)}</strong>
      </div>
    </article>
  );
}
