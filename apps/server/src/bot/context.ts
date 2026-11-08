import type { Context } from 'grammy';
import type { Customer } from '../modules/customers/index.js';

export interface BotContextFlavor {
  /** Set by the customer middleware for every update that has a sender. */
  customer: Customer;
}

export type BotContext = Context & BotContextFlavor;
