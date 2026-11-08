// Aggregates every module's tables for the Drizzle client and drizzle-kit.
// Modules own their tables; only the module itself should query them.
export * from '../modules/admins/schema.js';
export * from '../modules/audit/schema.js';
export * from '../modules/catalog/schema.js';
export * from '../modules/customers/schema.js';
export * from '../modules/notifications/schema.js';
export * from '../modules/settings/schema.js';
export * from '../modules/stock/schema.js';
export * from '../modules/wallet/schema.js';
export * from './infra-schema.js';
