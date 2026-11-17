/**
 * Turns the two webhook payloads into one flat "checkout context" the rules read:
 *
 *   payment filter   { payload: { cart, customer, payment_methods? } }
 *   shipping rates   { rateRequest: { all_items, dest_*, package_*, store_id, customer, ... } }
 *
 * Commerce versions differ in which fields they send, so every read falls back and anything
 * missing stays undefined: a condition on a missing value doesn't match (except "is not" and
 * "is not one of"). No dependencies, so the Admin's cart simulator builds the same shape.
 */

import { asList, toBoolean } from "./conditions.js";

export function toNumber(value, fallback = 0) {
  const n = Number(value);
  return value === "" || value === null || !Number.isFinite(n) ? fallback : n;
}

function pick(obj, ...keys) {
  if (!obj || typeof obj !== "object") {
    return;
  }
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) {
      return obj[key];
    }
  }
}

function text(value) {
  return value === undefined || value === null ? undefined : String(value);
}

function categoryIds(raw) {
  const product = raw?.product ?? {};
  const value =
    pick(raw, "category_ids") ??
    pick(product, "category_ids") ??
    pick(product.attributes ?? {}, "category_ids") ??
    pick(product.extension_attributes ?? {}, "category_ids");
  if (value === undefined) {
    const links = product.extension_attributes?.category_links;
    return Array.isArray(links)
      ? links.map((link) => String(link.category_id))
      : undefined;
  }
  return asList(value).map(String);
}

function attributes(raw) {
  const product = raw?.product ?? {};
  const out = {};
  for (const source of [product.attributes, raw?.attributes]) {
    if (source && typeof source === "object" && !Array.isArray(source)) {
      Object.assign(out, source);
    }
  }
  for (const attr of product.custom_attributes ?? []) {
    if (attr?.attribute_code) {
      out[attr.attribute_code] = attr.value;
    }
  }
  return out;
}

export function normaliseItem(raw) {
  const qty = toNumber(pick(raw, "qty", "quantity", "qty_ordered"));
  const price = toNumber(pick(raw, "base_price", "price"));
  return {
    attributes: attributes(raw),
    categoryIds: categoryIds(raw),
    isChild: Boolean(pick(raw, "parent_item_id", "parent_item")),
    price,
    qty,
    rowTotal: toNumber(pick(raw, "base_row_total", "row_total"), price * qty),
    sku: String(pick(raw, "sku") ?? pick(raw?.product ?? {}, "sku") ?? ""),
    weight: toNumber(pick(raw, "weight") ?? pick(raw?.product ?? {}, "weight")),
  };
}

function items(rawItems) {
  return (Array.isArray(rawItems) ? rawItems : [])
    .filter((item) => item && typeof item === "object")
    .map(normaliseItem)
    .filter((item) => !item.isChild && item.qty > 0);
}

function totals(list) {
  return {
    itemCount: list.length,
    qty: list.reduce((sum, item) => sum + item.qty, 0),
    subtotal: list.reduce((sum, item) => sum + item.rowTotal, 0),
    weight: list.reduce((sum, item) => sum + item.weight * item.qty, 0),
  };
}

function address(raw = {}) {
  return {
    city: text(pick(raw, "city")),
    country: text(pick(raw, "country_id", "country")),
    postcode: text(pick(raw, "postcode")),
    region: text(pick(raw, "region_code", "region_id", "region")),
  };
}

function shippingAddressOf(cart) {
  const fromAssignment =
    cart.extension_attributes?.shipping_assignments?.[0]?.shipping?.address;
  const fromList = Array.isArray(cart.addresses)
    ? cart.addresses.find((a) => a?.address_type === "shipping")
    : undefined;
  return (
    cart.shipping_address ??
    fromAssignment ??
    fromList ??
    cart.billing_address ??
    {}
  );
}

/** The available payment method codes, when Commerce sends them with the request. */
function paymentMethodCodes(payload) {
  const list = pick(payload, "payment_methods", "paymentMethods");
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .map((method) => (typeof method === "string" ? method : method?.code))
    .filter((code) => typeof code === "string" && code);
}

/** Context from the payment-method filter webhook (`params.payload`). */
export function fromPaymentPayload(params = {}) {
  const payload = params.payload ?? params;
  const cart = payload.cart ?? {};
  const customer = payload.customer ?? null;
  const list = items(cart.items);
  const sums = totals(list);
  const customerId = pick(customer ?? {}, "entity_id", "id");
  return {
    ...address(shippingAddressOf(cart)),
    availableMethods: paymentMethodCodes(payload),
    couponCode: text(pick(cart, "coupon_code")),
    customerGroup: text(
      pick(customer ?? {}, "group_id") ?? pick(cart, "customer_group_id"),
    ),
    isGuest:
      pick(cart, "customer_is_guest") === undefined
        ? !customerId
        : toBoolean(pick(cart, "customer_is_guest")),
    itemCount: sums.itemCount,
    items: list,
    qty: toNumber(pick(cart, "items_qty"), sums.qty),
    storeId: text(pick(cart, "store_id")),
    subtotal: toNumber(pick(cart, "base_subtotal", "subtotal"), sums.subtotal),
    weight: sums.weight,
  };
}

/** Context from the shipping-rates webhook (`params.rateRequest`). */
export function fromShippingPayload(params = {}) {
  const request = params.rateRequest ?? params.rate_request ?? params;
  const list = items(pick(request, "all_items", "items"));
  const sums = totals(list);
  const customer = request.customer ?? {};
  const customerId = pick(customer, "entity_id", "id");
  return {
    availableMethods: [],
    city: text(pick(request, "dest_city")),
    country: text(pick(request, "dest_country_id")),
    couponCode: text(pick(request, "coupon_code")),
    customerGroup: text(
      pick(customer, "group_id") ?? pick(request, "customer_group_id"),
    ),
    isGuest: !customerId,
    itemCount: sums.itemCount,
    items: list,
    postcode: text(pick(request, "dest_postcode")),
    qty: toNumber(pick(request, "package_qty"), sums.qty),
    region: text(pick(request, "dest_region_code", "dest_region_id")),
    storeId: text(pick(request, "store_id")),
    subtotal: toNumber(
      pick(request, "package_value_with_discount", "package_value"),
      sums.subtotal,
    ),
    weight: toNumber(pick(request, "package_weight"), sums.weight),
  };
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * The local date, weekday and minutes after midnight at `now` in `timeZone`. An unknown time
 * zone falls back to UTC rather than failing the request.
 */
export function clock(now = new Date(), timeZone = "UTC") {
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      timeZone,
      weekday: "short",
      year: "numeric",
    }).formatToParts(now);
  } catch {
    return clock(now, "UTC");
  }
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    weekday: get("weekday").slice(0, 3).toLowerCase(),
  };
}

export { WEEKDAYS };
