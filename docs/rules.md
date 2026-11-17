# Rules reference

A rule hides some payment or shipping methods, or allows only some and hides the rest, when its conditions match the checkout. The Admin page edits rules; this is their JSON, as stored in App Builder Database Storage and returned by the Admin actions.

```json
{
  "code": "wholesale-invoice-only",
  "name": "Wholesale pays by invoice",
  "type": "payment",
  "action": "allow_only",
  "methods": ["checkmo", "purchaseorder", "banktransfer"],
  "enabled": true,
  "priority": 30,
  "conditions": { "all": [{ "field": "customer_group", "op": "in", "value": "2" }] },
  "activeFrom": "2026-12-01",
  "activeTo": "2026-12-31",
  "stopFurther": false,
  "note": "Agreed with finance, ticket FIN-12"
}
```

## Fields

| Field | Required | Meaning |
|---|---|---|
| `code` | Yes | Unique, 1 to 64 characters: `a-z`, `0-9`, `-` and `_`. |
| `name` | Yes | Shown in the Admin and in **Test a cart**, up to 120 characters. |
| `type` | Yes | `payment` or `shipping`. |
| `action` | Yes | `hide`: hide the methods listed. `allow_only`: hide every method on the store's list that isn't listed. |
| `methods` | Yes | 1 to 100 method codes. Payment: the method code, for example `checkmo`. Shipping: `carrier_method`, for example `ups_GND`. End a code with `*` to match a prefix: `ups_*` is every UPS method. Matching ignores case. |
| `enabled` | No | `false` switches the rule off. New rules start off in the Admin. |
| `priority` | No | Lower numbers are checked first (default 0). Ties are ordered by code. |
| `conditions` | No | A condition tree (below). Without conditions the rule applies to every checkout. |
| `activeFrom`, `activeTo` | No | `YYYY-MM-DD`, inclusive, in the time zone from the settings. |
| `stopFurther` | No | When the rule applies, rules of the same type with a higher priority number are skipped. |
| `note` | No | Free text for the people who edit the rule. |

## How rules combine

- Rules of the requested type (payment or shipping) are checked in priority order. Every rule that applies adds the methods it hides; a method hidden by any rule is hidden.
- Two `allow_only` rules that both apply leave only the methods both allow.
- `hide` rules hide the codes they name even when the code isn't on the store's method list, because Commerce doesn't send its full list of shipping rates. Wildcards only expand over the method list (and, for payment, any methods Commerce sends with the request).
- **Fail open:** if any enabled rule of the requested type is invalid, or checking a rule throws, nothing is hidden. The app logs the reason.
- **Never everything:** if the result would hide every method on the store's list, nothing is hidden. **Test a cart** shows when this happens.

## Conditions

A condition tree is made of groups and comparisons:

```json
{ "all": [ ... ] }               every child must match (an empty list matches)
{ "any": [ ... ] }               at least one child must match (an empty list doesn't)
{ "not": { ... } }               the child must not match
{ "field": "...", "op": "...", "value": ... }
```

The Admin edits one level, a list joined by "all" or "any". Nested trees saved through the API are kept, and the editor offers to replace them with a list.

### Fields

| Field | Type | Payment webhook | Shipping webhook | Notes |
|---|---|---|---|---|
| `subtotal` | number | `cart.base_subtotal`, or the items' row totals | `package_value_with_discount`, `package_value`, or the items | Base currency. |
| `qty` | number | `cart.items_qty`, or the items | `package_qty`, or the items | |
| `item_count` | number | Cart lines | Cart lines | Child lines of configurable and bundle products aren't counted. |
| `weight` | number | Items' weight × qty | `package_weight`, or the items | In the store's weight unit. |
| `customer_group` | text | `customer.group_id`, or `cart.customer_group_id` | `customer.group_id`, or `customer_group_id` | The group's ID. The Admin offers the store's groups. Guests are group `0`. |
| `customer_is_guest` | yes/no | `cart.customer_is_guest`, or no customer | No customer ID | |
| `country` | text | The cart's shipping address | `dest_country_id` | Two-letter code, for example `US`. |
| `region` | text | `region_code`, `region_id` or `region` | `dest_region_code`, or `dest_region_id` | Codes such as `CA` where Commerce sends them. |
| `postcode` | text | Shipping address | `dest_postcode` | `starts_with` ignores spaces and case: `SW1, EC` matches `SW1A 1AA`. |
| `city` | text | Shipping address | `dest_city` | |
| `sku` | text, per item | Item SKUs | Item SKUs | Multi-valued (below). |
| `category_ids` | text, per item | From the payload, or looked up | From the payload, or looked up | Category IDs. Multi-valued. |
| `attr.<code>` | text, per item | `product.attributes`, or looked up | `product.attributes`, or looked up | Any product attribute, for example `attr.hazmat`. Multi-valued. |
| `store_id` | text | `cart.store_id` | `store_id` | The store view's ID. The Admin offers the store views. |
| `coupon_code` | text | `cart.coupon_code` | `coupon_code`, when sent | Commerce's rate request doesn't always carry the coupon; check with **Test a cart** and your logs. |
| `day_of_week` | day | The time of the request | The time of the request | `mon` to `sun`, in the settings' time zone. |
| `time` | time | The time of the request | The time of the request | `HH:MM`, in the settings' time zone. |

A field Commerce doesn't send is "missing": a missing value matches only `neq`, `nin` and `not_exists`.

### Operators

| Type | Operators |
|---|---|
| number | `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `between` (`"100, 500"`, inclusive) |
| text | `eq`, `neq`, `in`, `nin` (comma-separated lists), `contains`, `starts_with` (comma-separated prefixes), `exists`, `not_exists` |
| yes/no | `eq` with `true` or `false` |
| day | `in`, `nin` with `"sat, sun"` |
| time | `gte` (from), `lt` (before), `between` (`"22:00, 06:00"` wraps past midnight; the end is exclusive) |

Text comparisons ignore case and surrounding spaces. Numbers compare as numbers, so `"2"` equals `2`.

### Multi-valued fields

`sku`, `category_ids` and `attr.<code>` look at every item in the cart:

- `eq`, `in`, `contains`, `starts_with` and the number operators match when **any** item matches: `sku in A, B` means "the cart has A or B".
- `neq` and `nin` match when **no** item matches: `category_ids nin 12` means "nothing in the cart is in category 12".

## Examples

The Admin's **Start from example** menu has these, switched off:

| Example | Rule |
|---|---|
| No cash on delivery over 500 | payment, hide `cashondelivery`, when `subtotal gt 500` |
| Purchase orders for signed-in customers only | payment, hide `purchaseorder`, when `customer_is_guest eq true` |
| Wholesale pays by invoice | payment, allow only `checkmo, purchaseorder, banktransfer`, when `customer_group in 2` |
| Free shipping in the mainland US only | shipping, hide `freeshipping_freeshipping`, when `country neq US` or `region in AK, HI, PR` |
| No flat rate for carts over 30 kg | shipping, hide `flatrate_*`, when `weight gt 30` |
| Hazardous goods ship by ground | shipping, hide `ups_1DA, ups_2DA, fedex_PRIORITY_OVERNIGHT, dhl_*`, when `attr.hazmat eq 1` |
| No next-day air after 3 pm or at the weekend | shipping, hide `ups_1DA`, when `day_of_week in fri, sat, sun` or `time gte 15:00` |
