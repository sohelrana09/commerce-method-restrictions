/**
 * Payment & Shipping Method Restrictions: the rule engine.
 *
 * A rule hides some methods ("hide") or hides every method except some ("allow_only") when its
 * conditions match the checkout. The engine is dependency-free: the webhook actions run it in
 * App Builder, and the Admin page runs the same code for its "Test a cart" simulator.
 *
 * Safety:
 * - Fail open. If any enabled rule of the requested type is invalid or throws while it is
 *   checked, the result hides nothing and says why. A broken rule never removes a method.
 * - Never hide everything. If the rules would hide every known method, nothing is hidden, so
 *   shoppers can always check out. Shipping requests don't list their methods, so this only
 *   covers the methods in the store's method list (settings) for shipping.
 */

import {
  BOOLEAN_OPS,
  compare,
  compareTime,
  evaluate,
  LIST_OPS,
  leaves,
  NUMBER_OPS,
  parseTime,
  TEXT_OPS,
  TIME_OPS,
} from "./conditions.js";
import { clock } from "./context.js";

export {
  asList,
  compare,
  compareTime,
  evaluate,
  leaves,
  parseTime,
  toBoolean,
} from "./conditions.js";
export {
  clock,
  fromPaymentPayload,
  fromShippingPayload,
  normaliseItem,
  toNumber,
  WEEKDAYS,
} from "./context.js";

export const ATTRIBUTE_PREFIX = "attr.";
export const RULE_TYPES = ["payment", "shipping"];
export const ACTIONS = ["hide", "allow_only"];
export const MAX_METHODS = 100;
export const MAX_CONDITIONS = 50;

/** Field → value type. The type decides which operators apply. */
export const FIELDS = {
  category_ids: "text",
  city: "text",
  country: "text",
  coupon_code: "text",
  customer_group: "text",
  customer_is_guest: "boolean",
  day_of_week: "day",
  item_count: "number",
  postcode: "text",
  qty: "number",
  region: "text",
  sku: "text",
  store_id: "text",
  subtotal: "number",
  time: "time",
  weight: "number",
};

export const OPERATORS = {
  boolean: BOOLEAN_OPS,
  day: LIST_OPS,
  number: NUMBER_OPS,
  text: TEXT_OPS,
  time: TIME_OPS,
};

/** Fields that need product data (categories, attributes) on each cart item. */
export function isProductField(field) {
  return field === "category_ids" || field.startsWith(ATTRIBUTE_PREFIX);
}

export function fieldType(field) {
  if (typeof field !== "string") {
    return;
  }
  if (field.startsWith(ATTRIBUTE_PREFIX)) {
    return ATTRIBUTE_FIELD.test(field) ? "text" : undefined;
  }
  return FIELDS[field];
}

const CODE = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
const ATTRIBUTE_FIELD = /^attr\.[a-z0-9_]{1,60}$/u;
const METHOD = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\*?$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const DAYS = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const VALUELESS = new Set(["exists", "not_exists"]);

function listOf(value) {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function validateValue(prefix, type, op, value) {
  if (VALUELESS.has(op)) {
    return [];
  }
  if (value === undefined || value === null || value === "") {
    return [`${prefix} needs a value`];
  }
  if (op === "between") {
    const parts = listOf(value);
    const parse = type === "time" ? parseTime : Number;
    const ok =
      parts.length === 2 &&
      parts.every((part) => {
        const parsed = parse(part);
        return parsed !== undefined && Number.isFinite(parsed);
      });
    return ok
      ? []
      : [
          `${prefix} needs two values, "from,to"${type === "time" ? " as HH:MM" : ""}`,
        ];
  }
  if (type === "time" && parseTime(value) === undefined) {
    return [`${prefix} needs a time as HH:MM`];
  }
  if (type === "number" && !Number.isFinite(Number(value))) {
    return [`${prefix} needs a number`];
  }
  if (type === "day" && !listOf(value).every((d) => DAYS.has(d))) {
    return [`${prefix} needs days as mon, tue, wed, thu, fri, sat or sun`];
  }
  return [];
}

function validateConditions(conditions) {
  if (conditions === undefined || conditions === null) {
    return [];
  }
  if (typeof conditions !== "object" || Array.isArray(conditions)) {
    return ["conditions must be a condition group such as { all: [...] }"];
  }
  let list;
  try {
    list = leaves(conditions);
  } catch {
    return ["conditions are nested too deeply"];
  }
  if (list.length > MAX_CONDITIONS) {
    return [`at most ${MAX_CONDITIONS} conditions per rule`];
  }
  const errors = [];
  list.forEach((leaf, index) => {
    const prefix = `condition ${index + 1}`;
    const type = fieldType(leaf.field);
    if (!type) {
      errors.push(`${prefix} has an unknown field "${leaf.field}"`);
      return;
    }
    const op = leaf.op ?? "eq";
    if (!OPERATORS[type].includes(op)) {
      errors.push(`${prefix} can't use "${op}" with ${leaf.field}`);
      return;
    }
    errors.push(...validateValue(prefix, type, op, leaf.value));
  });
  return errors;
}

function validateIdentity(rule) {
  const errors = [];
  if (typeof rule.code !== "string" || !CODE.test(rule.code)) {
    errors.push(
      "code must be 1-64 characters: a-z, 0-9, - and _, starting with a letter or digit",
    );
  }
  if (
    typeof rule.name !== "string" ||
    !rule.name.trim() ||
    rule.name.length > 120
  ) {
    errors.push("name is required (up to 120 characters)");
  }
  if (!RULE_TYPES.includes(rule.type)) {
    errors.push('type must be "payment" or "shipping"');
  }
  if (!ACTIONS.includes(rule.action)) {
    errors.push('action must be "hide" or "allow_only"');
  }
  return errors;
}

function validateMethods(methods) {
  if (!Array.isArray(methods) || methods.length === 0) {
    return ["methods needs at least one method code"];
  }
  if (methods.length > MAX_METHODS) {
    return [`at most ${MAX_METHODS} methods per rule`];
  }
  const bad = methods.filter(
    (method) => typeof method !== "string" || !METHOD.test(method),
  );
  return bad.length
    ? [
        `method codes may use letters, digits, _, . and -, with an optional * at the end: ${bad.map(String).join(", ")}`,
      ]
    : [];
}

function validateSchedule(rule) {
  const errors = [];
  if (rule.priority !== undefined && !Number.isFinite(Number(rule.priority))) {
    errors.push("priority must be a number");
  }
  for (const key of ["activeFrom", "activeTo"]) {
    if (rule[key] && !(typeof rule[key] === "string" && DATE.test(rule[key]))) {
      errors.push(`${key} must be a date as YYYY-MM-DD`);
    }
  }
  if (rule.activeFrom && rule.activeTo && rule.activeFrom > rule.activeTo) {
    errors.push("activeFrom must be on or before activeTo");
  }
  return errors;
}

/** Returns a list of problems; an empty list means the rule is valid. */
export function validateRule(rule) {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
    return ["rule must be an object"];
  }
  return [
    ...validateIdentity(rule),
    ...validateMethods(rule.methods),
    ...validateSchedule(rule),
    ...validateConditions(rule.conditions),
  ];
}

/** A clock for a store-local date (YYYY-MM-DD) and time (HH:MM), e.g. for the Admin simulator. */
export function clockAt(date, time = "00:00") {
  const [year, month, day] = String(date).split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (!DATE.test(String(date)) || Number.isNaN(utc.getTime())) {
    return;
  }
  return {
    date: String(date),
    minutes: parseTime(time) ?? 0,
    weekday: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][utc.getUTCDay()],
  };
}

/** Whether a method code matches a rule's pattern: exact, or a prefix ending in "*". Ignores case. */
export function methodMatches(pattern, code) {
  const p = String(pattern).toLowerCase();
  const c = String(code).toLowerCase();
  return p.endsWith("*") ? c.startsWith(p.slice(0, -1)) : p === c;
}

/** Whether a rule's dates include `today` (YYYY-MM-DD). */
export function isActive(rule, today) {
  if (rule.activeFrom && today < rule.activeFrom) {
    return false;
  }
  return !(rule.activeTo && today > rule.activeTo);
}

/** "ups_GND" → { carrier_code: "ups", method: "GND" }: the carrier is the part before the first "_". */
export function splitShippingMethod(code) {
  const index = String(code).indexOf("_");
  return index > 0
    ? { carrier_code: code.slice(0, index), method: code.slice(index + 1) }
    : { carrier_code: code, method: code };
}

/** The store's method list (a comma-separated setting) as unique codes. */
export function parseMethodList(value) {
  const seen = new Set();
  const out = [];
  for (const code of listOf(value)) {
    const key = code.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(code);
    }
  }
  return out;
}

function sortRules(rules) {
  return [...rules].sort(
    (a, b) =>
      Number(a.priority ?? 0) - Number(b.priority ?? 0) ||
      String(a.code).localeCompare(String(b.code)),
  );
}

/** Whether any enabled rule needs product data (categories, attributes) on the cart items. */
export function needsProductData(rules, type) {
  return (rules ?? []).some(
    (rule) =>
      rule?.enabled !== false &&
      (!type || rule?.type === type) &&
      leaves(rule?.conditions).some((leaf) => isProductField(leaf.field)),
  );
}

/** Fills in categories and attributes the payload didn't carry from `catalog[sku]`. */
export function withProductData(context, catalog = {}) {
  return {
    ...context,
    items: (context.items ?? []).map((item) => {
      const entry = catalog[item.sku];
      if (!entry) {
        return item;
      }
      return {
        ...item,
        attributes: { ...(entry.attributes ?? {}), ...(item.attributes ?? {}) },
        categoryIds: item.categoryIds ?? (entry.categoryIds ?? []).map(String),
      };
    }),
  };
}

function reader(context, now) {
  const items = context.items ?? [];
  return (field) => {
    if (field.startsWith(ATTRIBUTE_PREFIX)) {
      const code = field.slice(ATTRIBUTE_PREFIX.length);
      return items.map((item) => item.attributes?.[code]);
    }
    switch (field) {
      case "category_ids":
        return items.flatMap((item) => item.categoryIds ?? []);
      case "city":
        return context.city;
      case "country":
        return context.country;
      case "coupon_code":
        return context.couponCode;
      case "customer_group":
        return context.customerGroup;
      case "customer_is_guest":
        return context.isGuest;
      case "day_of_week":
        return now.weekday;
      case "item_count":
        return context.itemCount ?? items.length;
      case "postcode":
        return context.postcode;
      case "qty":
        return context.qty;
      case "region":
        return context.region;
      case "sku":
        return items.map((item) => item.sku);
      case "store_id":
        return context.storeId;
      case "subtotal":
        return context.subtotal;
      case "time":
        return now.minutes;
      case "weight":
        return context.weight;
      default:
        throw new Error(`Unknown field "${field}"`);
    }
  };
}

function compareField(field, actual, op, expected) {
  return field === "time"
    ? compareTime(actual, op, expected)
    : compare(actual, op, expected);
}

function uniqueCodes(lists) {
  const seen = new Map();
  for (const code of lists.flat()) {
    if (typeof code === "string" && code && !seen.has(code.toLowerCase())) {
      seen.set(code.toLowerCase(), code);
    }
  }
  return [...seen.values()];
}

/** The methods a matching rule hides, given the methods known to exist. */
function targetsOf(rule, available) {
  const patterns = rule.methods ?? [];
  if (rule.action === "allow_only") {
    return available.filter(
      (code) => !patterns.some((pattern) => methodMatches(pattern, code)),
    );
  }
  const matched = available.filter((code) =>
    patterns.some((pattern) => methodMatches(pattern, code)),
  );
  const named = patterns.filter((pattern) => !pattern.endsWith("*"));
  return uniqueCodes([matched, named]);
}

function failOpen(base, error) {
  return { ...base, error, failedOpen: true, hidden: [] };
}

/** Records the methods a rule hides, with the rule as the reason. */
function hideAll(hidden, rule, codes) {
  for (const code of codes) {
    const key = code.toLowerCase();
    const current = hidden.get(key) ?? { code, reasons: [] };
    current.reasons.push({
      action: rule.action,
      name: rule.name,
      rule: rule.code,
    });
    hidden.set(key, current);
  }
}

/** Checks one rule; returns its trace entry. `state` carries the stop marker between rules. */
function checkRule(rule, { available, read, time, state }) {
  const entry = {
    code: rule.code,
    hides: [],
    name: rule.name,
    priority: Number(rule.priority ?? 0),
  };
  if (rule.enabled === false) {
    return { ...entry, status: "off" };
  }
  if (state.stopped) {
    return {
      ...entry,
      detail: `"${state.stopped}" stops later rules`,
      status: "skipped",
    };
  }
  if (!isActive(rule, time.date)) {
    return { ...entry, status: "inactive" };
  }
  if (!evaluate(rule.conditions, read, compareField)) {
    return { ...entry, status: "not_matched" };
  }
  if (rule.stopFurther) {
    state.stopped = rule.code;
  }
  const applied = {
    ...entry,
    hides: targetsOf(rule, available),
    status: "applied",
  };
  if (rule.action === "allow_only" && available.length === 0) {
    applied.detail =
      "No method list to compare with: add your methods in the app settings";
  }
  return applied;
}

/**
 * Checks the rules of one type against a checkout context.
 *
 * @param rules    every rule; only enabled rules of `type` are used
 * @param context  from fromPaymentPayload / fromShippingPayload (or the Admin simulator)
 * @param options  { type, methods: the store's method list, now: Date, timeZone, clock }
 *                 `clock` ({ date, minutes, weekday }, see clockAt) replaces now and timeZone
 * @returns { hidden: [{ code, reasons }], trace, available, failedOpen, safeguard, error? }
 */
export function evaluateRules(rules, context, options = {}) {
  const { type = "payment", methods = [], now = new Date() } = options;
  const time = options.clock ?? clock(now, options.timeZone);
  const available = uniqueCodes([context.availableMethods ?? [], methods]);
  const base = {
    available,
    failedOpen: false,
    hidden: [],
    safeguard: false,
    trace: [],
    type,
  };

  const ofType = sortRules(
    (Array.isArray(rules) ? rules : []).filter((rule) => rule?.type === type),
  );
  const invalid = ofType
    .filter((rule) => rule.enabled !== false)
    .map((rule) => ({ errors: validateRule(rule), rule }))
    .find(({ errors }) => errors.length);
  if (invalid) {
    return failOpen(
      base,
      `Rule "${invalid.rule.code}" is invalid: ${invalid.errors.join("; ")}`,
    );
  }

  const hidden = new Map();
  try {
    const shared = { available, read: reader(context, time), state: {}, time };
    for (const rule of ofType) {
      const entry = checkRule(rule, shared);
      base.trace.push(entry);
      hideAll(hidden, rule, entry.hides);
    }
  } catch (error) {
    return failOpen(base, `Couldn't check the rules: ${error.message}`);
  }

  const hidesEverything =
    available.length > 0 &&
    available.every((code) => hidden.has(code.toLowerCase()));
  if (hidesEverything) {
    return { ...base, safeguard: true };
  }
  return { ...base, hidden: [...hidden.values()] };
}
