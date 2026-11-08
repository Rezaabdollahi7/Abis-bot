# Abis Shop

A Telegram storefront selling AI-service subscriptions to Iranian customers, paid from a Toman wallet topped up by manual card-to-card transfer.

## People

**Customer** (مشتری):
A Telegram user who uses the bot to top up and buy.
_Avoid_: User (in domain code), client, buyer

**Admin** (ادمین):
A Telegram user with full access to the admin panel. All admins have the same permissions.
_Avoid_: Operator, moderator, staff

**Owner** (مالک):
One of the two founding admins defined in server config; cannot be removed from the panel.
_Avoid_: Super admin, root

## Catalog

**Provider** (شرکت):
The company behind a service, e.g. OpenAI, Google.
_Avoid_: Category, brand, vendor

**Product** (محصول):
A specific sellable plan of a provider, e.g. ChatGPT Plus. Owns delivery method, warranty and description.
_Avoid_: Plan, service, item

**Variant** (گزینه‌ی مدت):
A duration of a product with its Toman price, e.g. ChatGPT Plus · 3 months.
_Avoid_: Option, SKU, tier

**Featured** (ویژه):
A product flagged to appear on the shop's front page list.

**Delivery Method** (نوع تحویل):
How a product reaches the customer: Link, Ready Account, or Email Activation.

**Link** (لینک):
Delivery method where the customer receives an activation URL from stock.

**Ready Account** (اکانت آماده):
Delivery method where the customer receives credentials of an account we created, from stock.
_Avoid_: Credentials product, shared account

**Email Activation** (فعال‌سازی روی ایمیل):
Delivery method where an admin activates the subscription on the customer's own account using fields the customer provides.

**Required Fields** (فیلدهای موردنیاز):
The inputs (email, password, note) an Email Activation product asks the customer for.

**Stock Item** (آیتم انبار):
One encrypted, pre-loaded link or ready account waiting to be sold.
_Avoid_: Key, code, inventory row

**Stock** (انبار / موجودی):
The set of unsold stock items of a variant.

**Warranty** (گارانتی):
The period after delivery during which a broken subscription is replaced or refunded pro-rata.

## Money

**Wallet** (کیف پول):
A customer's Toman balance, derived as the sum of their ledger entries.
_Avoid_: Account, balance (as an entity)

**Ledger Entry** (تراکنش):
An immutable signed Toman amount on a wallet: top-up, purchase, refund, or adjustment.
_Avoid_: Transaction (ambiguous with DB transactions), payment

**Top-up** (شارژ):
A customer's request to add funds, carrying the claimed amount and a receipt screenshot, until an admin approves or rejects it.
_Avoid_: Deposit, payment, charge

**Receipt** (رسید / اسکرین‌شات):
The screenshot a customer sends as proof of a card-to-card transfer.

**Bank Card** (کارت بانکی):
A destination card number shown to customers for transfers; exactly one is active at a time.

**Adjustment** (اصلاحیه):
A ledger entry an admin creates by hand, always with a reason.

**Refund** (بازپرداخت):
A ledger entry returning money to the wallet after a rejected order or a warranty claim.

**Withdrawal** (برداشت / تسویه):
Paying wallet money back to the customer's card, handled manually through a ticket and recorded as an adjustment.

## Orders

**Order** (سفارش):
A purchase of one variant in some quantity, paid from the wallet, with the price frozen at purchase time.
_Avoid_: Purchase, invoice

**Manual Queue** (صف تحویل دستی):
Orders waiting for an admin to deliver: email activations, and stock-based orders that found no stock.

**Subscription** (اشتراک):
The delivered result of an order, with a start and an expiry date, used for reminders and warranty.

**Expiry Reminder** (یادآوری انقضا):
A message sent three days before a subscription expires, offering renewal.

## Support

**Ticket** (تیکت):
A support conversation between a customer and admins, with a topic and a status, optionally tied to an order.
_Avoid_: Chat, conversation, message thread

**Broadcast** (پیام همگانی):
A message sent by an admin to all customers.

**Direct Message** (پیام مستقیم):
A message an admin sends to one customer outside a ticket.

## Control

**Ban** (مسدودسازی):
A state that blocks a customer from buying and opening tickets while keeping their wallet.

**Audit Log** (تاریخچه‌ی اقدامات):
The record of every admin action: who, what, when.

**Forced Join** (عضویت اجباری):
A setting that requires channel membership before using the bot.
