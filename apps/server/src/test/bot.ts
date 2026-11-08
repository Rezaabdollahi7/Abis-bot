import type { Update, UserFromGetMe } from 'grammy/types';
import type { Db } from '../db/client.js';
import { createBot } from '../bot/index.js';

export interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

const botInfo: UserFromGetMe = {
  id: 1,
  is_bot: true,
  first_name: 'Test Bot',
  username: 'test_bot',
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
} as UserFromGetMe;

/**
 * A real grammY bot whose outgoing API calls are recorded instead of sent.
 * `responses` overrides the fake result per method (e.g. getChatMember).
 */
export function createTestBot(
  db: Db,
  options: { channelId?: string; responses?: Record<string, unknown> } = {},
) {
  const bot = createBot({
    db,
    config: { BOT_TOKEN: 'test-token', CHANNEL_ID: options.channelId },
    botConfig: { botInfo },
  });
  const calls: ApiCall[] = [];
  bot.api.config.use((_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    const result = options.responses?.[method] ?? true;
    return Promise.resolve({ ok: true as const, result: result as never });
  });

  let updateId = 0;
  const user = { id: 1000, is_bot: false, first_name: 'Reza' };
  const chat = { id: 1000, type: 'private' as const, first_name: 'Reza' };

  return {
    calls,
    /** Calls of one method, in order. */
    callsOf: (method: string) => calls.filter((call) => call.method === method),
    sendText: (text: string) =>
      bot.handleUpdate({
        update_id: ++updateId,
        message: {
          message_id: updateId,
          date: 0,
          chat,
          from: user,
          text,
          ...(text.startsWith('/')
            ? {
                entities: [
                  { type: 'bot_command', offset: 0, length: (text.split(' ')[0] ?? text).length },
                ],
              }
            : {}),
        },
      } as Update),
    pressButton: (data: string) =>
      bot.handleUpdate({
        update_id: ++updateId,
        callback_query: {
          id: String(updateId),
          from: user,
          chat_instance: '1',
          data,
          message: { message_id: 1, date: 0, chat, text: 'previous screen' },
        },
      } as Update),
  };
}
