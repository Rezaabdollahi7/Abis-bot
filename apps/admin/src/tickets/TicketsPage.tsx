import type {
  TicketDetailDto,
  TicketMessageDto,
  TicketStatus,
  TicketSummaryDto,
  TicketTopic,
} from '@abis/shared';
import { useState } from 'react';
import { ApiRequestError, apiFetch, apiFetchBlob } from '../api';
import { Modal, fa, formatDateTime } from '../ui';
import { useLoad } from '../useLoad';

const statusTabs: { id: TicketStatus; label: string }[] = [
  { id: 'awaiting_admin', label: 'منتظر پاسخ ما' },
  { id: 'awaiting_customer', label: 'پاسخ داده‌شده' },
  { id: 'closed', label: 'بسته' },
];

export const topicLabels: Record<TicketTopic, string> = {
  order: '📦 سفارش',
  payment: '💳 پرداخت',
  general: '💬 عمومی',
};

export function TicketsPage() {
  const [status, setStatus] = useState<TicketStatus>('awaiting_admin');
  const { data, error, reload } = useLoad<TicketSummaryDto[]>(`/tickets?status=${status}`);
  const [openId, setOpenId] = useState<number>();

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
      {data?.map((t) => (
        <button key={t.id} type="button" className="list-item" onClick={() => setOpenId(t.id)}>
          <span>
            <strong>
              #{fa(t.id)} · {topicLabels[t.topic]}
            </strong>{' '}
            <span className="muted">{t.customer.firstName}</span>
            <br />
            <small className="muted">{t.lastMessage?.slice(0, 80) ?? ''}</small>
          </span>
          <small className="muted">{formatDateTime(t.updatedAt)}</small>
        </button>
      ))}
      {openId !== undefined && (
        <TicketDialog
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

function TicketDialog(props: { id: number; onClose: () => void }) {
  const { data: ticket, error, reload } = useLoad<TicketDetailDto>(`/tickets/${props.id}`);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string>();

  async function act(path: string, body: unknown) {
    setBusy(true);
    setActionError(undefined);
    try {
      await apiFetch(`/tickets/${props.id}/${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setReply('');
      reload();
    } catch (err) {
      setActionError(
        err instanceof ApiRequestError && err.body?.message ? err.body.message : String(err),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`تیکت #${fa(props.id)}`} onClose={props.onClose}>
      {error && <p className="error">{error}</p>}
      {ticket && (
        <>
          <p className="muted">
            {topicLabels[ticket.topic]} · {ticket.customer.firstName}
            {ticket.customer.username && ` (@${ticket.customer.username})`}
            {ticket.orderLine && (
              <>
                <br />
                سفارش #{fa(ticket.orderId ?? 0)}: <bdi>{ticket.orderLine}</bdi>
              </>
            )}
          </p>
          <div className="thread">
            {ticket.messages.map((m) => (
              <Message key={m.id} message={m} />
            ))}
          </div>
          <textarea
            rows={3}
            className="reply-box"
            placeholder="پاسخ به مشتری…"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          {actionError && <p className="error">{actionError}</p>}
          <footer className="modal-actions">
            <button
              type="button"
              disabled={busy || !reply.trim()}
              onClick={() => void act('reply', { text: reply })}
            >
              ارسال پاسخ
            </button>
            {ticket.status !== 'closed' && (
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => void act('close', {})}
              >
                🔒 بستن تیکت
              </button>
            )}
          </footer>
        </>
      )}
    </Modal>
  );
}

function Message({ message }: { message: TicketMessageDto }) {
  const [url, setUrl] = useState<string>();
  const loadFile = () =>
    apiFetchBlob(`/ticket-messages/${message.id}/file`).then((blob) =>
      setUrl(URL.createObjectURL(blob)),
    );
  return (
    <div className={`bubble ${message.fromAdmin ? 'mine' : ''}`}>
      <small className="muted">
        {message.fromAdmin ? `🎧 ${message.fromAdmin}` : '👤 مشتری'} ·{' '}
        {formatDateTime(message.createdAt)}
      </small>
      {message.text && <div className="pre-wrap">{message.text}</div>}
      {message.fileKind &&
        (url ? (
          message.fileKind === 'photo' ? (
            <img className="receipt" src={url} alt="پیوست" />
          ) : (
            <a href={url} download>
              دانلود فایل
            </a>
          )
        ) : (
          <button type="button" className="ghost" onClick={() => void loadFile()}>
            📎 {message.fileKind === 'photo' ? 'نمایش تصویر' : 'دریافت فایل'}
          </button>
        ))}
    </div>
  );
}
