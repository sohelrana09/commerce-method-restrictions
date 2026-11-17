import { ATTRIBUTE_PREFIX, FIELDS, fieldType, OPERATORS } from "#engine";

import type { CartItem, CheckoutContext } from "#engine";
import type {
  ConditionLeaf,
  Lookups,
  MatchMode,
  Rule,
  RuleType,
  SampleCart,
} from "./types.ts";

export const TYPE_LABELS: Record<RuleType, string> = {
  payment: "Payment",
  shipping: "Shipping",
};

export const ACTION_LABELS = {
  allow_only: "Allow only these methods",
  hide: "Hide these methods",
} as const;

export const FIELD_LABELS: Record<string, string> = {
  attribute: "Product attribute (any item)",
  category_ids: "Category ID (any item)",
  city: "City",
  country: "Shipping country",
  coupon_code: "Coupon code",
  customer_group: "Customer group",
  customer_is_guest: "Guest checkout",
  day_of_week: "Day of the week",
  item_count: "Number of cart lines",
  postcode: "Postcode",
  qty: "Cart quantity",
  region: "Region or state",
  sku: "SKU (any item)",
  store_id: "Store view",
  subtotal: "Cart subtotal",
  time: "Time of day",
  weight: "Cart weight",
};

/** Field picker order: cart, customer, address, products, store and time. */
export const FIELD_ORDER = [
  "subtotal",
  "qty",
  "item_count",
  "weight",
  "customer_group",
  "customer_is_guest",
  "country",
  "region",
  "postcode",
  "city",
  "sku",
  "category_ids",
  "attribute",
  "store_id",
  "coupon_code",
  "day_of_week",
  "time",
];

export const OPERATOR_LABELS: Record<string, string> = {
  between: "is between",
  contains: "contains",
  eq: "is",
  exists: "has any value",
  gt: "is more than",
  gte: "is at least",
  in: "is one of",
  lt: "is less than",
  lte: "is at most",
  neq: "is not",
  nin: "is not one of",
  not_exists: "has no value",
  starts_with: "starts with",
};

/** "time is at least" reads better as "time is from"; "between" too. */
export function operatorLabel(field: string, op: string): string {
  if (field === "time") {
    return { between: "is between", gte: "is from", lt: "is before" }[op] ?? op;
  }
  if (field === "sku" || field === "category_ids" || isAttribute(field)) {
    return (
      {
        eq: "includes",
        in: "includes one of",
        neq: "doesn't include",
        nin: "includes none of",
      }[op] ??
      OPERATOR_LABELS[op] ??
      op
    );
  }
  return OPERATOR_LABELS[op] ?? op;
}

export const DAY_LABELS: Record<string, string> = {
  fri: "Friday",
  mon: "Monday",
  sat: "Saturday",
  sun: "Sunday",
  thu: "Thursday",
  tue: "Tuesday",
  wed: "Wednesday",
};
export const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function isAttribute(field: string): boolean {
  return field.startsWith(ATTRIBUTE_PREFIX);
}

/** The field picker's key: attribute conditions share one entry. */
export function fieldKey(field: string): string {
  return isAttribute(field) ? "attribute" : field;
}

export function attributeCode(field: string): string {
  return isAttribute(field) ? field.slice(ATTRIBUTE_PREFIX.length) : "";
}

export function typeOfKey(key: string) {
  return key === "attribute"
    ? "text"
    : (fieldType(key) ?? (FIELDS as Record<string, string>)[key] ?? "text");
}

export function operatorsFor(key: string): string[] {
  return (OPERATORS as Record<string, string[]>)[typeOfKey(key)];
}

export function needsValue(op: string): boolean {
  return op !== "exists" && op !== "not_exists";
}

export function defaultCondition(key: string): ConditionLeaf {
  const field = key === "attribute" ? `${ATTRIBUTE_PREFIX}` : key;
  const type = typeOfKey(key);
  const [op] = operatorsFor(key);
  const value: Record<string, ConditionLeaf["value"]> = {
    boolean: true,
    day: "sat, sun",
    number: 0,
    text: "",
    time: "09:00, 17:00",
  };
  return {
    field,
    op: type === "time" ? "between" : op,
    value: value[type] ?? "",
  };
}

export function newCondition(): ConditionLeaf {
  return { field: "subtotal", op: "gt", value: 100 };
}

/**
 * The editor shows a flat list joined by "all" or "any". Rules saved through the API may nest
 * groups; those come back as `nested: true` and the editor offers to replace them.
 */
export function toFlat(conditions: Rule["conditions"]): {
  match: MatchMode;
  list: ConditionLeaf[];
  nested: boolean;
} {
  if (!conditions) {
    return { list: [], match: "all", nested: false };
  }
  const node = conditions as Record<string, unknown>;
  for (const match of ["all", "any"] as const) {
    const children = node[match];
    if (Array.isArray(children)) {
      const flat = children.every(
        (child) => child && typeof child.field === "string",
      );
      return {
        list: flat ? (children as ConditionLeaf[]) : [],
        match,
        nested: !flat,
      };
    }
  }
  if (typeof node.field === "string") {
    return { list: [conditions as ConditionLeaf], match: "all", nested: false };
  }
  return { list: [], match: "all", nested: true };
}

export function toTree(match: MatchMode, list: ConditionLeaf[]) {
  const clean = list.map((leaf) =>
    needsValue(leaf.op) ? leaf : { field: leaf.field, op: leaf.op },
  );
  return match === "any" ? { any: clean } : { all: clean };
}

export function toCode(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64);
}

export function emptyRule(type: RuleType = "payment"): Rule {
  return {
    action: "hide",
    code: "",
    conditions: { all: [] },
    enabled: false,
    methods: [],
    name: "",
    priority: 10,
    stopFurther: false,
    type,
  };
}

/** A deep copy the editor can change without touching the list's copy. */
export function editableCopy(rule: Rule): Rule {
  const { updatedAt: _updatedAt, ...rest } = structuredClone(rule);
  return { ...emptyRule(rule.type), ...rest };
}

/** Drops empty optional fields before saving, so stored rules stay tidy. */
export function cleanRule(rule: Rule): Rule {
  const { activeFrom, activeTo, note, ...rest } = rule;
  return {
    ...rest,
    ...(activeFrom ? { activeFrom } : {}),
    ...(activeTo ? { activeTo } : {}),
    ...(note?.trim() ? { note: note.trim() } : {}),
    methods: rule.methods.map((m) => m.trim()).filter(Boolean),
    name: rule.name.trim(),
  };
}

function describeValue(leaf: ConditionLeaf, lookups: Lookups | null): string {
  const raw = String(leaf.value ?? "");
  if (typeof leaf.value === "boolean") {
    return leaf.value ? "yes" : "no";
  }
  const names = (list: { id: string; label: string }[]) =>
    raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => list.find((item) => item.id === id)?.label ?? id)
      .join(", ");
  if (leaf.field === "customer_group" && lookups?.customerGroups.length) {
    return names(lookups.customerGroups);
  }
  if (leaf.field === "store_id" && lookups?.storeViews.length) {
    return names(lookups.storeViews);
  }
  if (leaf.field === "day_of_week") {
    return raw
      .split(",")
      .map((day) => DAY_LABELS[day.trim()] ?? day.trim())
      .join(", ");
  }
  if (leaf.field === "customer_is_guest") {
    return ["1", "true", "yes"].includes(raw.toLowerCase()) ? "yes" : "no";
  }
  return raw;
}

export function describeCondition(
  leaf: ConditionLeaf,
  lookups: Lookups | null = null,
): string {
  const key = fieldKey(leaf.field);
  const field =
    key === "attribute"
      ? `attribute ${attributeCode(leaf.field)}`
      : (FIELD_LABELS[key] ?? key);
  const op = operatorLabel(leaf.field, leaf.op);
  return needsValue(leaf.op)
    ? `${field} ${op} ${describeValue(leaf, lookups)}`
    : `${field} ${op}`;
}

export function describeConditions(
  rule: Rule,
  lookups: Lookups | null = null,
): string {
  const { list, match, nested } = toFlat(rule.conditions);
  if (nested) {
    return "Nested conditions (edited through the API)";
  }
  if (!list.length) {
    return "Always";
  }
  return list
    .map((leaf) => describeCondition(leaf, lookups))
    .join(match === "any" ? " or " : " and ");
}

export function describeMethods(rule: Rule): string {
  const verb = rule.action === "allow_only" ? "Only" : "Hide";
  return `${verb} ${rule.methods.join(", ")}`;
}

export function describeWhen(rule: Rule): string {
  if (rule.activeFrom && rule.activeTo) {
    return `${rule.activeFrom} to ${rule.activeTo}`;
  }
  if (rule.activeFrom) {
    return `From ${rule.activeFrom}`;
  }
  if (rule.activeTo) {
    return `Until ${rule.activeTo}`;
  }
  return "Always";
}

/** Today's date and the current time, for the simulator's defaults. */
export function nowParts(now = new Date()): { date: string; time: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}

export function defaultSample(now = new Date()): SampleCart {
  return {
    city: "Austin",
    country: "US",
    couponCode: "",
    customerGroup: "1",
    isGuest: false,
    items:
      "TSHIRT-1 | 2 | 25 | 0.3 | 12 |\nLAMP-OIL | 1 | 18 | 1.2 | 20 | hazmat=1",
    postcode: "73301",
    region: "TX",
    storeId: "1",
    type: "payment",
    ...nowParts(now),
  };
}

export const ITEMS_HELP =
  "One item per line: SKU | qty | price | weight | category IDs (comma-separated) | attributes (code=value; code=value).";

/** Parses the simulator's item lines. Blank and unreadable parts become 0 or empty. */
export function parseItems(text: string): CartItem[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sku = "", qty, price, weight, categories = "", attrs = ""] = line
        .split("|")
        .map((part) => part.trim());
      const number = (value?: string, fallback = 0) => {
        const n = Number(value);
        return value && Number.isFinite(n) ? n : fallback;
      };
      const attributes: Record<string, string> = {};
      for (const pair of attrs.split(";")) {
        const index = pair.indexOf("=");
        if (index > 0) {
          attributes[pair.slice(0, index).trim()] = pair
            .slice(index + 1)
            .trim();
        }
      }
      const q = number(qty, 1);
      const p = number(price);
      return {
        attributes,
        categoryIds: categories
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
        price: p,
        qty: q,
        rowTotal: p * q,
        sku,
        weight: number(weight),
      };
    })
    .filter((item) => item.sku);
}

/** The sample in the context shape the engine reads (as the webhooks build it from Commerce). */
export function sampleToContext(sample: SampleCart): CheckoutContext {
  const items = parseItems(sample.items);
  const blank = (value: string) => value.trim() || undefined;
  return {
    availableMethods: [],
    city: blank(sample.city),
    country: blank(sample.country),
    couponCode: blank(sample.couponCode),
    customerGroup: blank(sample.customerGroup),
    isGuest: sample.isGuest,
    itemCount: items.length,
    items,
    postcode: blank(sample.postcode),
    qty: items.reduce((sum, item) => sum + item.qty, 0),
    region: blank(sample.region),
    storeId: blank(sample.storeId),
    subtotal: items.reduce((sum, item) => sum + item.rowTotal, 0),
    weight: items.reduce((sum, item) => sum + item.weight * item.qty, 0),
  };
}
