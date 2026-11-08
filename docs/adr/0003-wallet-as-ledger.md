# Wallet balance is derived from an append-only ledger

A customer's balance is never stored as an editable number; it is the sum of immutable `ledger_entries` (top-up, purchase, refund, adjustment). Manual changes by admins are adjustment entries with a reason. This makes every Toman traceable, makes double-crediting visible, and lets us rebuild any balance. Every money-moving operation is a guarded state transition (`WHERE status='pending'`) inside one DB transaction so it happens exactly once even when two admins click at the same time.
