/**
 * Condition trees, in the spirit of Magento cart price rule conditions. The model is the one
 * Extra Fees uses, with day-and-time fields and "has a value" operators added.
 *
 * A node is either a group or a leaf:
 *   { all: [node, ...] }      every child must match (an empty list matches)
 *   { any: [node, ...] }      at least one child must match (an empty list does not match)
 *   { not: node }             negation
 *   { field, op, value }      a comparison
 *
 * Multi-valued fields (the SKUs, categories or an attribute across the cart's items) match
 * "eq", "in", "contains" and "starts_with" when any value matches, and "neq" and "nin" only when
 * no value matches. So `sku in A,B` reads "the cart has A or B" and `sku nin A,B` reads "the cart
 * has neither".
 *
 * This file has no dependencies: it runs in App Builder actions and in the Admin page.
 */

export const NUMBER_OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "between"];
export const TEXT_OPS = [
  "eq",
  "neq",
  "in",
  "nin",
  "contains",
  "starts_with",
  "exists",
  "not_exists",
];
export const TIME_OPS = ["gte", "lt", "between"];
export const LIST_OPS = ["in", "nin"];
export const BOOLEAN_OPS = ["eq"];

export const ALL_OPS = new Set([
  ...NUMBER_OPS,
  ...TEXT_OPS,
  ...TIME_OPS,
  ...LIST_OPS,
  ...BOOLEAN_OPS,
]);

const RANGE_OPS = new Set(["gt", "gte", "lt", "lte", "between"]);
const TIME = /^(?<hours>[01]?\d|2[0-3]):(?<minutes>[0-5]\d)$/u;

export function asList(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null || value === "") {
    return [];
  }
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** "09:30" → 570 minutes after midnight; undefined when it isn't a valid HH:MM time. */
export function parseTime(value) {
  const match = TIME.exec(String(value ?? "").trim());
  if (!match) {
    return;
  }
  return Number(match.groups.hours) * 60 + Number(match.groups.minutes);
}

function sameValue(a, b) {
  if (typeof a === "number" || typeof b === "number") {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) {
      return na === nb;
    }
  }
  if (typeof a === "boolean" || typeof b === "boolean") {
    return toBoolean(a) === toBoolean(b);
  }
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

export function toBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  return ["1", "true", "yes", "on"].includes(
    String(value).trim().toLowerCase(),
  );
}

function compareRange(n, op, expected) {
  switch (op) {
    case "gt":
      return n > Number(expected);
    case "gte":
      return n >= Number(expected);
    case "lt":
      return n < Number(expected);
    case "lte":
      return n <= Number(expected);
    default: {
      const [min, max] = asList(expected).map(Number);
      return n >= min && n <= max;
    }
  }
}

/** Time of day: values are HH:MM, and a "between" range may wrap past midnight (22:00,06:00). */
export function compareTime(minutes, op, expected) {
  if (op === "between") {
    const [from, to] = asList(expected).map(parseTime);
    if (from === undefined || to === undefined) {
      return false;
    }
    return from <= to
      ? minutes >= from && minutes < to
      : minutes >= from || minutes < to;
  }
  const limit = parseTime(expected);
  if (limit === undefined) {
    return false;
  }
  return op === "gte" ? minutes >= limit : minutes < limit;
}

export function compare(actual, op, expected) {
  if (RANGE_OPS.has(op)) {
    if (Array.isArray(actual)) {
      return actual.some((value) => compare(value, op, expected));
    }
    const n = Number(actual);
    return Number.isFinite(n) ? compareRange(n, op, expected) : false;
  }

  if (Array.isArray(actual)) {
    if (op === "nin" || op === "neq") {
      return actual.every((value) => compare(value, op, expected));
    }
    return actual.some((value) => compare(value, op, expected));
  }

  switch (op) {
    case "eq":
      return sameValue(actual, expected);
    case "neq":
      return !sameValue(actual, expected);
    case "in":
      return asList(expected).some((value) => sameValue(actual, value));
    case "nin":
      return !asList(expected).some((value) => sameValue(actual, value));
    case "contains":
      return String(actual)
        .toLowerCase()
        .includes(String(expected).toLowerCase());
    case "starts_with":
      // Postcode prefixes: "SW1,EC" matches SW1A 1AA and EC2V 7HH.
      return asList(expected).some((prefix) =>
        String(actual)
          .toUpperCase()
          .replace(/\s+/gu, "")
          .startsWith(String(prefix).toUpperCase().replace(/\s+/gu, "")),
      );
    default:
      throw new Error(`Unknown operator "${op}"`);
  }
}

function isMissing(value) {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) &&
      value.every((v) => v === undefined || v === null || v === ""))
  );
}

/**
 * Evaluates a condition tree. `read(field)` returns the value a leaf compares; `compareField`
 * lets the caller handle special fields (time of day) before the generic comparison.
 */
const compareAny = (_field, actual, op, expected) =>
  compare(actual, op, expected);

export function evaluate(node, read, compareField = compareAny) {
  if (!node) {
    return true;
  }
  if (Array.isArray(node.all)) {
    return node.all.every((child) => evaluate(child, read, compareField));
  }
  if (Array.isArray(node.any)) {
    return node.any.some((child) => evaluate(child, read, compareField));
  }
  if (node.not) {
    return !evaluate(node.not, read, compareField);
  }
  if (typeof node.field === "string") {
    const op = node.op ?? "eq";
    const actual = read(node.field);
    if (op === "exists") {
      return !isMissing(actual);
    }
    if (op === "not_exists") {
      return isMissing(actual);
    }
    if (isMissing(actual)) {
      return op === "neq" || op === "nin";
    }
    return compareField(node.field, actual, op, node.value);
  }
  throw new Error("Invalid condition node");
}

/** Every leaf of a tree, e.g. to validate it or decide whether product data is needed. */
export function leaves(node, out = []) {
  if (!node || typeof node !== "object") {
    return out;
  }
  for (const key of ["all", "any"]) {
    if (Array.isArray(node[key])) {
      for (const child of node[key]) {
        leaves(child, out);
      }
    }
  }
  if (node.not) {
    leaves(node.not, out);
  }
  if (typeof node.field === "string") {
    out.push(node);
  }
  return out;
}
