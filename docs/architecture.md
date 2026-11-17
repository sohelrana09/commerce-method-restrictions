# Architecture

## Pieces

| Piece | Where | Runs |
|---|---|---|
| Rules engine | `src/common/engine/` | In both webhook actions and in the Admin page's **Test a cart**. No dependencies. |
| Webhook actions | `src/commerce-extensibility-1/actions/` | I/O Runtime, called by Commerce at checkout. Public URLs; each request must be signed. |
| Admin actions | `src/commerce-backend-ui-2/actions/` | I/O Runtime, called by the Admin page with the admin's IMS token (`require-adobe-auth`). |
| Admin page | `src/commerce-backend-ui-2/web-src/` | In the Commerce Admin, through the Admin UI SDK. React Spectrum 2. |
| Storage | `src/common/restrictions/` | App Builder Database Storage: `restriction_rules` and `restriction_catalog`. |
| Settings | `app.commerce.config.ts` (`businessConfig`) | App Management's configuration form, read with `@adobe/aio-commerce-lib-config`. |

## A checkout request

```
Commerce ──POST (signed)──> filter-payment / filter-shipping
  1. verifyWebhook: RSA-SHA256 over the raw body, COMMERCE_WEBHOOKS_PUBLIC_KEY   → 401 on failure
  2. loadSettings: master switch, method lists, time zone                        ┐
  3. listRulesCached: enabled rules of this type (30 s per warm container)       │ any error:
  4. fromPaymentPayload / fromShippingPayload → checkout context                 │ "no change"
  5. needsProductData? → loadCatalogEntries (REST, cached 1 h)                   │
  6. evaluateRules → hidden methods, or fail open / safeguard                    ┘
  7. answer: add operations per hidden method, or { op: "success" }
```

## The engine

- `conditions.js`: condition trees (`all`, `any`, `not`, comparisons) and the comparison rules, reused from Extra Fees with "has a value" operators and time-of-day ranges added.
- `context.js`: reads both webhook payloads into one flat context, and the store-local clock.
- `index.js`: field and operator definitions, `validateRule`, `evaluateRules` and helpers.

`evaluateRules(rules, context, { type, methods, now, timeZone })` returns:

```js
{
  type: "payment",
  available: ["checkmo", "cashondelivery", "purchaseorder"], // the method list, plus methods Commerce sent
  hidden: [{ code: "cashondelivery", reasons: [{ rule: "no-cod-over-500", name: "...", action: "hide" }] }],
  trace: [{ code: "no-cod-over-500", status: "applied", hides: ["cashondelivery"], ... }],
  failedOpen: false, // true: a rule was invalid or threw; nothing is hidden
  safeguard: false,  // true: the rules would have hidden every method; nothing is hidden
}
```

**Test a cart** shows `hidden` and `trace` as they are, so the Admin explains the same decision checkout makes.

## Failure policy

| What fails | Result |
|---|---|
| Missing or wrong signature, missing key | 401, nothing read. Commerce keeps every method. |
| Settings can't be read | Defaults (restrictions on, default method lists, UTC). |
| Rules can't be read | "No change". |
| Product lookup fails | Cached data or none: category and attribute conditions don't match. |
| An enabled rule is invalid, or checking throws | "No change", logged as an error. |
| The rules would hide every method | "No change", logged as a warning. |
| The action times out | Commerce carries on (`required: false`). |

## Security

- Webhook actions trust nothing until the signature checks out, and answer a bare 401 otherwise.
- Admin actions require the admin's IMS token; the menu is ACL-protected.
- Rules are validated on save (the same `validateRule` the engine uses), and again before every checkout.
- Error details go to the logs, never to the browser or Commerce. Webhook payloads are never logged; at `debug` level the actions log the methods they hid.
