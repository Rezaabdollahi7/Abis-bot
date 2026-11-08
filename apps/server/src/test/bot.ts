import type { Update, UserFromGetMe } from 'grammy/types';
import type { Db } from '../db/client.js';
import { createBot } from '../bot/index.js';
import { testCipher } from './cipher.js';

export interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

export const TEST_CUSTOMER_ID = 1000;

const botInfo = {
  id: 1,
  is_bot: true,
  first_name: 'Test Bot',
  username: 'test_bot',
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
} as UserFromGetMe;

/**
 * A real grammY bot whose outgoing API calls are recorded instead of sent.
 * `responses` overrides the fake result per method (e.g. getChatMember).
 * Every helper takes an optional sender id, so tests can act as a customer or an admin.
 */
export function createTestBot(
  db: Db,
  options: { channelId?: string; ownerIds?: number[]; responses?: Record<string, unknown> } = {},
) {
  const bot = createBot({
    db,
    cipher: testCipher,
    config: {
      BOT_TOKEN: 'test-token',
      CHANNEL_ID: options.channelId,
      OWNER_TELEGRAM_IDS: options.ownerIds ?? [],
    },
    botConfig: { botInfo },
  });
  const calls: ApiCall[] = [];
  let messageId = 100;
  bot.api.config.use((_prev, method, payload) => {
    const p = payload as Record<string, unknown>;
    calls.push({ method, payload: p });
    const fake = method.startsWith('send')
      ? { message_id: ++messageId, date: 0, chat: { id: p.chat_id, type: 'private' } }
      : true;
    const result = options.responses?.[method] ?? fake;
    return Promise.resolve({ ok: true as const, result: result as never });
  });

  let updateId = 0;
  const user = (id: number) => ({ id, is_bot: false, first_name: `User${id}` });
  const chat = (id: number) => ({ id, type: 'private' as const, first_name: `User${id}` });
  const message = (from: number, extra: object) =>
    bot.handleUpdate({
      update_id: ++updateId,
      message: { message_id: ++updateId, date: 0, chat: chat(from), from: user(from), ...extra },
    } as Update);

  return {
    calls,
    /** Calls of one method, in order. */
    callsOf: (method: string) => calls.filter((call) => call.method === method),
    /** The text of every message sent to a chat (sendMessage text and sendPhoto caption). */
    sentTo: (chatId: number) =>
      calls
        .filter((c) => c.payload.chat_id === chatId && c.method.startsWith('send'))
        .map((c) => String(c.payload.text ?? c.payload.caption ?? '')),
    sendText: (text: string, from = TEST_CUSTOMER_ID) =>
      message(from, {
        text,
        ...(text.startsWith('/')
          ? {
              entities: [
                { type: 'bot_command', offset: 0, length: (text.split(' ')[0] ?? text).length },
              ],
            }
          : {}),
      }),
    sendPhoto: (fileUniqueId: string, from = TEST_CUSTOMER_ID) =>
      message(from, {
        photo: [
          {
            file_id: `small-${fileUniqueId}`,
            file_unique_id: `s-${fileUniqueId}`,
            width: 90,
            height: 90,
          },
          { file_id: `big-${fileUniqueId}`, file_unique_id: fileUniqueId, width: 900, height: 900 },
        ],
      }),
    sendContact: (phone: string, contactUserId = TEST_CUSTOMER_ID, from = TEST_CUSTOMER_ID) =>
      message(from, { contact: { phone_number: phone, first_name: 'X', user_id: contactUserId } }),
    pressButton: (data: string, from = TEST_CUSTOMER_ID) =>
      bot.handleUpdate({
        update_id: ++updateId,
        callback_query: {
          id: String(updateId),
          from: user(from),
          chat_instance: '1',
          data,
          message: { message_id: 1, date: 0, chat: chat(from), text: 'previous screen' },
        },
      } as Update),
  };
}
