# Webhooks

Method Restrictions answers two Commerce checkout webhooks. App Management subscribes them when the app is installed (`webhooks` in `app.commerce.config.ts`), with the method names for the instance's environment.

| Webhook method | Environment | Action |
|---|---|---|
| `plugin.out_of_process_payment_methods.api.payment_method_filter.get_list` | SaaS | `method-restrictions/filter-payment` |
| `plugin.magento.out_of_process_payment_methods.api.payment_method_filter.get_list` | PaaS | `method-restrictions/filter-payment` |
| `plugin.out_of_process_shipping_methods.api.shipping_rate_repository.get_rates` | SaaS | `method-restrictions/filter-shipping` |
| `plugin.magento.out_of_process_shipping_methods.api.shipping_rate_repository.get_rates` | PaaS | `method-restrictions/filter-shipping` |

Both are `after` webhooks with a 3-second timeout (1-second soft timeout), and `required: false`: if the app doesn't answer in time, Commerce carries on with every method. Names follow Adobe's [checkout starter kit](https://github.com/adobe/commerce-checkout-starter-kit) and its [payment](https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/payment-use-cases/) and [shipping](https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/shipping-use-cases/) use cases. Confirm them on your instance with `GET /V1/webhooks/supportedList`.

## Request

Commerce posts JSON and signs it. The actions run with `raw-http: true` and `require-adobe-auth: false`, so they get the exact bytes Commerce signed.

**Payment** (`fields: payload`):

```json
{
  "payload": {
    "cart": {
      "store_id": 1,
      "base_subtotal": 600,
      "coupon_code": "SAVE10",
      "items": [{ "sku": "LAMP-OIL", "qty": 2, "price": "300.0000", "product": { "attributes": { "hazmat": "1" } } }],
      "shipping_address": { "country_id": "US", "region_code": "TX", "postcode": "73301" }
    },
    "customer": { "entity_id": "1", "group_id": "1" }
  }
}
```

**Shipping** (`fields: rateRequest`):

```json
{
  "rateRequest": {
    "all_items": [{ "sku": "LAMP-OIL", "qty": 1, "product": { "attributes": { "hazmat": "1" } } }],
    "dest_country_id": "US",
    "dest_region_code": "TX",
    "dest_postcode": "73301",
    "package_value_with_discount": 90,
    "package_weight": 6,
    "package_qty": 2,
    "store_id": 1,
    "customer": { "id": 4, "group_id": "1" }
  }
}
```

Commerce versions differ in which fields they send. `src/common/engine/context.js` reads each value from several places, and anything missing simply doesn't match a condition (see [rules.md](rules.md#fields)). Set `LOG_LEVEL=debug` on a Stage workspace to see what the app decided for each request.

## Signature

1. Commerce signs the request body with its private key and sends the base64 signature in `x-adobe-commerce-webhook-signature`.
2. The action decodes `__ow_body` (App Builder base64-encodes JSON bodies under `raw-http`) and verifies the signature with RSA-SHA256 and `COMMERCE_WEBHOOKS_PUBLIC_KEY`. Adobe's App Builder sample verifies the base64 form instead, so that is accepted too; both need Commerce's private key.
3. No key, no header, no body, a bad key or a wrong signature: the action answers **401** with `{ "error": "Unauthorized" }` and reads nothing else. Commerce then carries on with every method.

## Response

The answer is a list of operations, built with `@adobe/aio-commerce-sdk/webhooks/responses`.

**Hide payment methods:** one operation per method.

```json
[{ "op": "add", "path": "result", "value": { "code": "cashondelivery" } }]
```

**Remove shipping methods:** one operation per method, with the code split at its first `_` into carrier and method.

```json
[{ "op": "add", "path": "result", "value": { "carrier_code": "ups", "method": "1DA", "remove": true } }]
```

**No change:**

```json
[{ "op": "success" }]
```

The app answers "no change" when restrictions are switched off, there are no enabled rules of that type, nothing matches, any rule is invalid, the rules would hide every method, or anything fails after the signature check.

> Adobe's starter kit shows shipping removal as `{ "method": "flatrate", "remove": true }`. This app also sends `carrier_code`, so a method code shared by two carriers isn't removed from both. If your Commerce version handles removal differently, check `operationFor` in `src/commerce-extensibility-1/actions/webhook.js`.

## Testing without Commerce

The org this app was built in has no Commerce instance, so the webhooks are covered by unit tests: `test/actions/webhook.test.js` signs payloads with a throwaway RSA key pair (`test/fixtures/signing.js`) and checks the operations, the 401s and every fail-open path. **Test a cart** in the Admin runs the same engine on a cart you describe.
