import { describe, expect, test } from "vitest";

import {
  cleanRule,
  defaultCondition,
  defaultSample,
  describeConditions,
  describeMethods,
  describeWhen,
  editableCopy,
  emptyRule,
  nowParts,
  operatorLabel,
  parseItems,
  sampleToContext,
  toCode,
  toFlat,
  toTree,
} from "../../src/commerce-backend-ui-2/web-src/src/lib/rules.ts";
import { evaluateRules } from "../../src/common/engine/index.js";

import type {
  Lookups,
  Rule,
} from "../../src/commerce-backend-ui-2/web-src/src/lib/types.ts";

const lookups: Lookups = {
  customerGroups: [{ id: "2", label: "Wholesale" }],
  paymentMethods: ["checkmo", "cashondelivery"],
  shippingMethods: [],
  storeViews: [{ code: "fr", id: "2", label: "French" }],
  timezone: "UTC",
};

describe("Admin rule helpers", () => {
  test("flat lists and trees round-trip", () => {
    expect(toFlat(undefined)).toEqual({
      list: [],
      match: "all",
      nested: false,
    });
    expect(toFlat({ any: [{ field: "qty", op: "gt", value: 1 }] }).match).toBe(
      "any",
    );
    expect(toFlat({ all: [{ any: [] }] }).nested).toBe(true);
    expect(toFlat({ field: "qty", op: "gt", value: 1 }).list).toHaveLength(1);
    expect(toFlat({ not: { field: "qty", op: "gt" } }).nested).toBe(true);
    expect(
      toTree("any", [{ field: "coupon_code", op: "exists", value: "x" }]),
    ).toEqual({
      any: [{ field: "coupon_code", op: "exists" }],
    });
    expect(toTree("all", [])).toEqual({ all: [] });
  });

  test("describes rules in words", () => {
    const rule: Rule = {
      ...emptyRule(),
      conditions: {
        any: [
          { field: "customer_group", op: "in", value: "2, 9" },
          { field: "store_id", op: "eq", value: "2" },
          { field: "day_of_week", op: "in", value: "sat, sun" },
          { field: "customer_is_guest", op: "eq", value: true },
          { field: "attr.hazmat", op: "eq", value: "1" },
          { field: "coupon_code", op: "exists" },
          { field: "time", op: "between", value: "09:00, 17:00" },
        ],
      },
      methods: ["checkmo"],
    };
    expect(describeConditions(rule, lookups)).toBe(
      "Customer group is one of Wholesale, 9 or Store view is French or Day of the week is one of Saturday, Sunday or Guest checkout is yes or attribute hazmat includes 1 or Coupon code has any value or Time of day is between 09:00, 17:00",
    );
    expect(
      describeConditions({
        ...rule,
        conditions: {
          all: [{ field: "customer_is_guest", op: "eq", value: "no" }],
        },
      }),
    ).toBe("Guest checkout is no");
    expect(describeConditions({ ...rule, conditions: undefined })).toBe(
      "Always",
    );
    expect(
      describeConditions({ ...rule, conditions: { not: { all: [] } } }),
    ).toContain("Nested");
    expect(describeMethods(rule)).toBe("Hide checkmo");
    expect(describeMethods({ ...rule, action: "allow_only" })).toBe(
      "Only checkmo",
    );
    expect(describeWhen(rule)).toBe("Always");
    expect(describeWhen({ ...rule, activeFrom: "2026-01-01" })).toBe(
      "From 2026-01-01",
    );
    expect(describeWhen({ ...rule, activeTo: "2026-01-02" })).toBe(
      "Until 2026-01-02",
    );
    expect(
      describeWhen({
        ...rule,
        activeFrom: "2026-01-01",
        activeTo: "2026-01-02",
      }),
    ).toBe("2026-01-01 to 2026-01-02");
    expect(operatorLabel("sku", "nin")).toBe("includes none of");
    expect(operatorLabel("sku", "between")).toBe("is between");
    expect(operatorLabel("time", "gte")).toBe("is from");
    expect(operatorLabel("time", "eq")).toBe("eq");
    expect(operatorLabel("x", "zz")).toBe("zz");
  });

  test("new conditions fit their field", () => {
    expect(defaultCondition("time")).toEqual({
      field: "time",
      op: "between",
      value: "09:00, 17:00",
    });
    expect(defaultCondition("attribute")).toEqual({
      field: "attr.",
      op: "eq",
      value: "",
    });
    expect(defaultCondition("customer_is_guest").value).toBe(true);
    expect(defaultCondition("day_of_week")).toMatchObject({ op: "in" });
    expect(defaultCondition("subtotal")).toMatchObject({ op: "eq", value: 0 });
  });

  test("editing and cleaning a rule", () => {
    const copy = editableCopy({
      ...emptyRule("shipping"),
      code: "a",
      name: " A ",
      updatedAt: "x",
    } as Rule);
    expect(copy).not.toHaveProperty("updatedAt");
    expect(copy.type).toBe("shipping");
    const clean = cleanRule({
      ...copy,
      activeFrom: "",
      methods: [" ups_* ", ""],
      note: "  ",
    });
    expect(clean).toMatchObject({ methods: ["ups_*"], name: "A" });
    expect(clean).not.toHaveProperty("activeFrom");
    expect(clean).not.toHaveProperty("note");
    expect(
      cleanRule({ ...copy, activeTo: "2026-01-01", note: " why " }),
    ).toMatchObject({ activeTo: "2026-01-01", note: "why" });
    expect(toCode(" Free Shipping! US ")).toBe("free-shipping-us");
  });

  test("the simulator's cart becomes an engine context", () => {
    expect(
      parseItems("A | 2 | 10 | 1.5 | 3, 4 | hazmat=1; color = red\n\n | 1\nB"),
    ).toEqual([
      {
        attributes: { color: "red", hazmat: "1" },
        categoryIds: ["3", "4"],
        price: 10,
        qty: 2,
        rowTotal: 20,
        sku: "A",
        weight: 1.5,
      },
      {
        attributes: {},
        categoryIds: [],
        price: 0,
        qty: 1,
        rowTotal: 0,
        sku: "B",
        weight: 0,
      },
    ]);
    const sample = {
      ...defaultSample(new Date(2026, 10, 21, 9, 5)),
      couponCode: " ",
    };
    expect(sample).toMatchObject({ date: "2026-11-21", time: "09:05" });
    const context = sampleToContext(sample);
    expect(context).toMatchObject({
      couponCode: undefined,
      country: "US",
      itemCount: 2,
      qty: 3,
      subtotal: 68,
    });
    expect(context.weight).toBeCloseTo(1.8);
    expect(nowParts().date).toHaveLength(10);
    const result = evaluateRules(
      [
        {
          action: "hide",
          code: "h",
          methods: ["ups_1DA"],
          name: "H",
          type: "shipping",
          conditions: { all: [{ field: "attr.hazmat", op: "eq", value: "1" }] },
        },
      ],
      context,
      { type: "shipping" },
    );
    expect(result.hidden.map((h) => h.code)).toEqual(["ups_1DA"]);
  });
});
