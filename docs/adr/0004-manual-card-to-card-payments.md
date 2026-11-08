# Manual card-to-card payments, Toman only

Version 1 accepts only card-to-card transfers verified by an admin from a receipt screenshot; there is no payment gateway (Zarinpal etc.) and no USD/USDT pricing anywhere. This keeps v1 free of gateway contracts and FX logic. The top-up module is the only place a payment source is modelled, so a gateway can later be added as another way to approve a top-up.
