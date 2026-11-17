import { describe, expect, test } from "vitest";

import {
  clock,
  clockAt,
  evaluateRules,
  fieldType,
  isActive,
  methodMatches,
  needsProductData,
  parseMethodList,
  splitShippingMethod,
  validateRule,
  withProductData,
} from "../../src/common/engine/index.js";
import { DEFAULT_RULES } from "../../src/common/restrictions/default-rules.js";

const rule = (overrides = {}) => ({
  action: "hide",
  code: "r1",
  enabled: true,
  methods: ["cashondelivery"],
  name: "Rule 1",
  type: "payment",
  ...overrides,
});

const cart = (overrides = {}) => ({
  city: "Austin",
  country: "US",
  couponCode: undefined,
  customerGroup: "1",
  isGuest: false,
  itemCount: 2,
  items: [
    {
      attributes: { hazmat: "1" },
      categoryIds: ["3", "7"],
      price: 50,
      qty: 2,
      rowTotal: 100,
      sku: "A",
      weight: 2,
    },
    {
      attributes: {},
      categoryIds: ["4"],
      price: 20,
      qty: 1,
      rowTotal: 20,
      sku: "B",
      weight: 1,
    },
  ],
  postcode: "73301",
  qty: 3,
  region: "TX",
  storeId: "1",
  subtotal: 120,
  weight: 5,
  ...overrides,
});

// Wednesday 2026-11-18, 14:30 UTC.
const now = new Date("2026-11-18T14:30:00Z");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const payment = ["checkmo", "cashondelivery", "purchaseorder"];

describe("validateRule", () => {
  test("accepts every example rule", () => {
    for (const example of DEFAULT_RULES) {
      expect(validateRule(example), example.code).toEqual([]);
    }
  });

  test("reports each problem", () => {
    expect(validateRule(null)).toEqual(["rule must be an object"]);
    const errors = validateRule({
      action: "remove",
      activeFrom: "2026-12-31",
      activeTo: "2026-01-01",
      code: "Bad Code",
      methods: ["ok_*", "bad method"],
      name: "",
      priority: "high",
      type: "billing",
    });
    expect(errors).toEqual([
      expect.stringContaining("code must be"),
      expect.stringContaining("name is required"),
      expect.stringContaining("type must be"),
      expect.stringContaining("action must be"),
      expect.stringContaining("bad method"),
      "priority must be a number",
      "activeFrom must be on or before activeTo",
    ]);
    expect(validateRule(rule({ activeTo: "31/12/2026" }))).toEqual([
      "activeTo must be a date as YYYY-MM-DD",
    ]);
    expect(validateRule(rule({ methods: [] }))).toEqual([
      "methods needs at least one method code",
    ]);
    expect(
      validateRule(
        rule({ methods: Array.from({ length: 101 }, (_, i) => `m${i}`) }),
      ),
    ).toEqual(["at most 100 methods per rule"]);
  });

  test("checks conditions", () => {
    const check = (conditions) => validateRule(rule({ conditions }));
    expect(check([])).toEqual([
      "conditions must be a condition group such as { all: [...] }",
    ]);
    expect(check({ all: [{ field: "colour", op: "eq", value: "x" }] })).toEqual(
      ['condition 1 has an unknown field "colour"'],
    );
    expect(
      check({ all: [{ field: "attr.Bad Code", op: "eq", value: "x" }] }),
    ).toEqual(['condition 1 has an unknown field "attr.Bad Code"']);
    expect(
      check({ all: [{ field: "subtotal", op: "contains", value: 1 }] }),
    ).toEqual(['condition 1 can\'t use "contains" with subtotal']);
    expect(
      check({
        all: [
          { field: "subtotal", op: "gt" },
          { field: "subtotal", op: "gt", value: "lots" },
          { field: "subtotal", op: "between", value: "1" },
          { field: "time", op: "gte", value: "3pm" },
          { field: "time", op: "between", value: "09:00,25:00" },
          { field: "day_of_week", op: "in", value: "mon, funday" },
          { field: "coupon_code", op: "exists" },
          { field: "attr.color", op: "eq", value: "red" },
          { field: "subtotal", op: "between", value: "1,2" },
        ],
      }),
    ).toEqual([
      "condition 1 needs a value",
      "condition 2 needs a number",
      'condition 3 needs two values, "from,to"',
      "condition 4 needs a time as HH:MM",
      'condition 5 needs two values, "from,to" as HH:MM',
      "condition 6 needs days as mon, tue, wed, thu, fri, sat or sun",
    ]);
    const many = {
      all: Array.from({ length: 51 }, () => ({
        field: "qty",
        op: "gt",
        value: 1,
      })),
    };
    expect(check(many)).toEqual(["at most 50 conditions per rule"]);
    const deep = {};
    let node = deep;
    for (let i = 0; i < 20_000; i += 1) {
      node.not = {};
      node = node.not;
    }
    expect(check(deep)).toEqual(["conditions are nested too deeply"]);
  });
});

describe("helpers", () => {
  test("methodMatches handles exact codes and prefixes, ignoring case", () => {
    expect(methodMatches("checkmo", "CheckMo")).toBe(true);
    expect(methodMatches("ups_*", "ups_GND")).toBe(true);
    expect(methodMatches("ups_*", "usps_1")).toBe(false);
    expect(methodMatches("ups", "ups_GND")).toBe(false);
  });

  test("splitShippingMethod splits at the first underscore", () => {
    expect(splitShippingMethod("fedex_FEDEX_GROUND")).toEqual({
      carrier_code: "fedex",
      method: "FEDEX_GROUND",
    });
    expect(splitShippingMethod("pickup")).toEqual({
      carrier_code: "pickup",
      method: "pickup",
    });
  });

  test("parseMethodList dedupes, ignoring case", () => {
    expect(parseMethodList("checkmo, CHECKMO, free,,")).toEqual([
      "checkmo",
      "free",
    ]);
    expect(parseMethodList(["a", "b"])).toEqual(["a", "b"]);
    expect(parseMethodList(undefined)).toEqual([]);
  });

  test("isActive compares dates", () => {
    expect(isActive({}, "2026-11-18")).toBe(true);
    expect(isActive({ activeFrom: "2026-11-19" }, "2026-11-18")).toBe(false);
    expect(isActive({ activeTo: "2026-11-17" }, "2026-11-18")).toBe(false);
    expect(
      isActive(
        { activeFrom: "2026-11-18", activeTo: "2026-11-18" },
        "2026-11-18",
      ),
    ).toBe(true);
  });

  test("fieldType knows attributes", () => {
    expect(fieldType("attr.color")).toBe("text");
    expect(fieldType("subtotal")).toBe("number");
    expect(fieldType(42)).toBeUndefined();
  });

  test("clock reads the local day and time, and falls back to UTC", () => {
    expect(clock(now, "UTC")).toEqual({
      date: "2026-11-18",
      minutes: 870,
      weekday: "wed",
    });
    expect(clock(now, "Asia/Tokyo")).toEqual({
      date: "2026-11-18",
      minutes: 1410,
      weekday: "wed",
    });
    expect(clock(now, "Pacific/Kiritimati").date).toBe("2026-11-19");
    expect(clock(now, "Not/AZone")).toEqual(clock(now, "UTC"));
    expect(clock().date).toMatch(ISO_DATE);
  });

  test("clockAt builds a clock from a local date and time", () => {
    expect(clockAt("2026-11-21", "18:45")).toEqual({
      date: "2026-11-21",
      minutes: 1125,
      weekday: "sat",
    });
    expect(clockAt("2026-11-21")).toMatchObject({ minutes: 0 });
    expect(clockAt("2026-11-21", "bad")).toMatchObject({ minutes: 0 });
    expect(clockAt("tomorrow")).toBeUndefined();
    const result = evaluateRules(
      [
        rule({
          conditions: {
            all: [{ field: "day_of_week", op: "in", value: "sat" }],
          },
        }),
      ],
      cart(),
      { clock: clockAt("2026-11-21", "10:00"), methods: payment },
    );
    expect(result.hidden).toHaveLength(1);
  });

  test("needsProductData and withProductData", () => {
    const productRule = rule({
      conditions: { all: [{ field: "category_ids", op: "in", value: "3" }] },
    });
    expect(needsProductData([rule()])).toBe(false);
    expect(needsProductData([productRule])).toBe(true);
    expect(needsProductData([productRule], "shipping")).toBe(false);
    expect(needsProductData([{ ...productRule, enabled: false }])).toBe(false);
    expect(needsProductData(undefined)).toBe(false);

    const context = {
      items: [
        { sku: "A" },
        { attributes: { color: "red" }, categoryIds: ["1"], sku: "B" },
      ],
    };
    const merged = withProductData(context, {
      A: { attributes: { hazmat: "1" }, categoryIds: [5] },
      B: { attributes: { color: "blue", size: "L" }, categoryIds: ["9"] },
    });
    expect(merged.items[0]).toEqual({
      attributes: { hazmat: "1" },
      categoryIds: ["5"],
      sku: "A",
    });
    expect(merged.items[1]).toEqual({
      attributes: { color: "red", size: "L" },
      categoryIds: ["1"],
      sku: "B",
    });
    expect(withProductData({}).items).toEqual([]);
    expect(
      withProductData({ items: [{ sku: "Z" }] }, { Z: {} }).items[0],
    ).toEqual({ attributes: {}, categoryIds: [], sku: "Z" });
  });
});

describe("evaluateRules", () => {
  const run = (rules, context = cart(), options = {}) =>
    evaluateRules(rules, context, {
      methods: payment,
      now,
      timeZone: "UTC",
      type: "payment",
      ...options,
    });

  test("hides methods when conditions match, with reasons", () => {
    const result = run([
      rule({
        conditions: { all: [{ field: "subtotal", op: "gt", value: 100 }] },
      }),
      rule({
        code: "r2",
        conditions: { all: [{ field: "subtotal", op: "gt", value: 500 }] },
        methods: ["purchaseorder"],
        name: "Rule 2",
      }),
    ]);
    expect(result.hidden).toEqual([
      {
        code: "cashondelivery",
        reasons: [{ action: "hide", name: "Rule 1", rule: "r1" }],
      },
    ]);
    expect(result.trace.map((t) => t.status)).toEqual([
      "applied",
      "not_matched",
    ]);
    expect(result.failedOpen).toBe(false);
  });

  test("allow_only hides every other known method, and two of them intersect", () => {
    const result = run([
      rule({ action: "allow_only", methods: ["checkmo", "purchaseorder"] }),
      rule({
        action: "allow_only",
        code: "r2",
        methods: ["purchaseorder", "cashondelivery"],
      }),
    ]);
    expect(result.hidden.map((h) => h.code).sort()).toEqual([
      "cashondelivery",
      "checkmo",
    ]);
    expect(
      result.hidden
        .find((h) => h.code === "cashondelivery")
        .reasons.map((r) => r.rule),
    ).toEqual(["r1"]);
  });

  test("hides named methods outside the method list, and expands wildcards over it", () => {
    const result = evaluateRules(
      [rule({ methods: ["ups_*", "dhl_P"], type: "shipping" })],
      cart(),
      {
        methods: ["ups_GND", "ups_1DA", "flatrate_flatrate"],
        now,
        type: "shipping",
      },
    );
    expect(result.hidden.map((h) => h.code)).toEqual([
      "ups_GND",
      "ups_1DA",
      "dhl_P",
    ]);
  });

  test("allow_only without a method list does nothing and says why", () => {
    const result = run(
      [rule({ action: "allow_only", methods: ["checkmo"] })],
      cart(),
      { methods: [] },
    );
    expect(result.hidden).toEqual([]);
    expect(result.trace[0].detail).toContain("No method list");
  });

  test("uses methods Commerce sends with the request", () => {
    const result = run(
      [rule({ action: "allow_only", methods: ["checkmo"] })],
      cart({ availableMethods: ["checkmo", "venmo"] }),
      { methods: [] },
    );
    expect(result.available).toEqual(["checkmo", "venmo"]);
    expect(result.hidden.map((h) => h.code)).toEqual(["venmo"]);
  });

  test("never hides every method", () => {
    const result = run([rule({ methods: ["c*", "purchaseorder"] })]);
    expect(result.safeguard).toBe(true);
    expect(result.hidden).toEqual([]);
  });

  test("skips off, other-type, scheduled and stopped rules; sorts by priority", () => {
    const result = run([
      rule({ code: "later", methods: ["checkmo"], priority: 20 }),
      rule({ code: "stopper", priority: 10, stopFurther: true }),
      rule({ code: "off", enabled: false, priority: 1 }),
      rule({ activeFrom: "2027-01-01", code: "future", priority: 5 }),
      rule({ code: "ship", type: "shipping" }),
      rule({ code: "same-a", priority: 20 }),
    ]);
    expect(result.trace.map((t) => [t.code, t.status])).toEqual([
      ["off", "off"],
      ["future", "inactive"],
      ["stopper", "applied"],
      ["later", "skipped"],
      ["same-a", "skipped"],
    ]);
    expect(result.trace[3].detail).toContain("stopper");
    expect(result.hidden.map((h) => h.code)).toEqual(["cashondelivery"]);
  });

  test("fails open on an invalid enabled rule, but ignores invalid disabled ones", () => {
    const broken = run([rule(), rule({ code: "bad", methods: [] })]);
    expect(broken.failedOpen).toBe(true);
    expect(broken.hidden).toEqual([]);
    expect(broken.error).toContain('Rule "bad" is invalid');
    expect(
      run([rule(), rule({ code: "bad", enabled: false, methods: [] })]).hidden,
    ).toHaveLength(1);
  });

  test("fails open when a rule throws", () => {
    const result = run([rule()], {
      get items() {
        throw new Error("boom");
      },
    });
    expect(result.failedOpen).toBe(true);
    expect(result.error).toContain("boom");
    expect(evaluateRules(null, cart()).hidden).toEqual([]);
  });

  test("reads every field", () => {
    const matches = (field, op, value, context = cart()) =>
      run([rule({ conditions: { all: [{ field, op, value }] } })], context)
        .hidden.length === 1;
    expect(matches("customer_group", "in", "1,2")).toBe(true);
    expect(matches("customer_is_guest", "eq", false)).toBe(true);
    expect(matches("subtotal", "between", "100,150")).toBe(true);
    expect(matches("qty", "eq", 3)).toBe(true);
    expect(matches("item_count", "eq", 2)).toBe(true);
    expect(
      matches(
        "item_count",
        "eq",
        1,
        cart({ itemCount: undefined, items: [{ sku: "A" }] }),
      ),
    ).toBe(true);
    expect(matches("weight", "gt", 4)).toBe(true);
    expect(matches("country", "eq", "us")).toBe(true);
    expect(matches("region", "in", "TX,CA")).toBe(true);
    expect(matches("postcode", "starts_with", "733")).toBe(true);
    expect(matches("city", "eq", "austin")).toBe(true);
    expect(matches("store_id", "eq", "1")).toBe(true);
    expect(matches("coupon_code", "not_exists")).toBe(true);
    expect(
      matches("coupon_code", "eq", "staff", cart({ couponCode: "STAFF" })),
    ).toBe(true);
    expect(matches("sku", "in", "B,C")).toBe(true);
    expect(matches("sku", "nin", "B,C")).toBe(false);
    expect(matches("category_ids", "in", "7")).toBe(true);
    expect(matches("attr.hazmat", "eq", "1")).toBe(true);
    expect(matches("day_of_week", "in", "wed")).toBe(true);
    expect(matches("day_of_week", "nin", "wed")).toBe(false);
    expect(matches("time", "between", "14:00,15:00")).toBe(true);
    expect(matches("time", "gte", "15:00")).toBe(false);
    expect(
      matches("category_ids", "in", "7", cart({ items: [{ sku: "A" }] })),
    ).toBe(false);
  });

  test("uses the time zone for dates and times", () => {
    const rules = [rule({ activeFrom: "2026-11-19" })];
    expect(run(rules).hidden).toHaveLength(0);
    expect(
      run(rules, cart(), { timeZone: "Pacific/Kiritimati" }).hidden,
    ).toHaveLength(1);
    expect(
      evaluateRules([rule()], cart(), { methods: payment }).hidden,
    ).toHaveLength(1);
  });
});
