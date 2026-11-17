# Changelog

## v0.1.0 (2026-11-17)

The first release: rules that hide, or allow only, payment and shipping methods at checkout, for Adobe Commerce as a Cloud Service and PaaS, built as an App Builder app.

- **Rules engine:** one dependency-free module (`src/common/engine`) shared by both webhooks and the Admin's **Test a cart**. "Hide" and "allow only" rules for payment or shipping methods, with exact codes or `prefix*` wildcards; conditions on customer group, guest checkout, cart subtotal, quantity, lines and weight, shipping country, region, postcode and city, SKUs, categories and attributes in the cart, store view, coupon code, day of the week and time of day, in condition trees ("all", "any", "not") reused from Extra Fees; priorities, stop-further and start and end dates in the store's time zone ([docs/rules.md](docs/rules.md)).
- **Safety:** an invalid enabled rule, or any error while checking the rules, hides nothing; rules that would hide every known method hide none.
- **Webhooks:** `method-restrictions/filter-payment` for `payment_method_filter.get_list` and `method-restrictions/filter-shipping` for `shipping_rate_repository.get_rates`, SaaS and PaaS method names, registered by App Management. Each request's `x-adobe-commerce-webhook-signature` is checked against `COMMERCE_WEBHOOKS_PUBLIC_KEY`; unsigned requests get a 401. Everything after the signature check fails open ([docs/webhooks.md](docs/webhooks.md)).
- **Product data:** category and attribute conditions use the payload, or Commerce REST product lookups cached for an hour in App Builder Database Storage.
- **Admin page:** list, start from examples, edit and delete rules in the Commerce Admin (Admin UI SDK, React Spectrum 2), with store view and customer group pickers from Commerce, and **Test a cart**, which shows each method, available or hidden, the rules that hide it and how every rule was checked.
- **Settings:** a master switch, the store's payment and shipping method lists, and the time zone, in App Management.
- **Admin preview:** `npm run admin:preview` serves the real Admin page at http://localhost:4360/preview.html with an in-browser rules store.
