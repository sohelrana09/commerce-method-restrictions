import { describe, expect, test } from "vitest";

import {
  asList,
  compare,
  compareTime,
  evaluate,
  leaves,
  parseTime,
  toBoolean,
} from "../../src/common/engine/conditions.js";

describe("compare", () => {
  test("numbers and ranges", () => {
    expect(compare(10, "gt", 5)).toBe(true);
    expect(compare(10, "gte", 10)).toBe(true);
    expect(compare(10, "lt", 10)).toBe(false);
    expect(compare(10, "lte", 10)).toBe(true);
    expect(compare(10, "between", "5,10")).toBe(true);
    expect(compare(11, "between", [5, 10])).toBe(false);
    expect(compare("abc", "gt", 1)).toBe(false);
    expect(compare([1, 20], "gt", 10)).toBe(true);
  });

  test("text, lists and booleans ignore case and spaces", () => {
    expect(compare("US", "eq", "us")).toBe(true);
    expect(compare("2", "eq", 2)).toBe(true);
    expect(compare(true, "eq", "yes")).toBe(true);
    expect(compare(false, "eq", true)).toBe(false);
    expect(compare("x", "neq", "y")).toBe(true);
    expect(compare("CA", "in", "ny, ca")).toBe(true);
    expect(compare("TX", "nin", "NY,CA")).toBe(true);
    expect(compare("Hello world", "contains", "WORLD")).toBe(true);
    expect(compare("SW1A 1AA", "starts_with", "sw1, ec")).toBe(true);
    expect(compare("N1 9GU", "starts_with", "SW1")).toBe(false);
    expect(() => compare("x", "nope", "y")).toThrow('Unknown operator "nope"');
  });

  test("multi-valued fields: any value for in, no value for nin", () => {
    expect(compare(["A", "B"], "in", "B,C")).toBe(true);
    expect(compare(["A", "B"], "nin", "B,C")).toBe(false);
    expect(compare(["A", "D"], "nin", "B,C")).toBe(true);
    expect(compare(["A"], "neq", "A")).toBe(false);
  });
});

describe("time of day", () => {
  test("parses HH:MM", () => {
    expect(parseTime("09:30")).toBe(570);
    expect(parseTime("9:05")).toBe(545);
    expect(parseTime("24:00")).toBeUndefined();
    expect(parseTime(undefined)).toBeUndefined();
  });

  test("compares, including ranges past midnight", () => {
    expect(compareTime(900, "gte", "15:00")).toBe(true);
    expect(compareTime(899, "lt", "15:00")).toBe(true);
    expect(compareTime(600, "between", "09:00,17:00")).toBe(true);
    expect(compareTime(17 * 60, "between", "09:00,17:00")).toBe(false);
    expect(compareTime(23 * 60, "between", "22:00,06:00")).toBe(true);
    expect(compareTime(5 * 60, "between", "22:00,06:00")).toBe(true);
    expect(compareTime(12 * 60, "between", "22:00,06:00")).toBe(false);
    expect(compareTime(600, "between", "bad")).toBe(false);
    expect(compareTime(600, "gte", "bad")).toBe(false);
  });
});

describe("evaluate", () => {
  const values = {
    country: "US",
    coupon: "",
    groups: [],
    subtotal: 120,
  };
  const read = (field) => values[field];

  test("groups, negation and empty groups", () => {
    expect(evaluate(undefined, read)).toBe(true);
    expect(evaluate({ all: [] }, read)).toBe(true);
    expect(evaluate({ any: [] }, read)).toBe(false);
    expect(
      evaluate(
        {
          all: [
            { field: "country", op: "eq", value: "US" },
            {
              any: [
                { field: "subtotal", op: "gt", value: 500 },
                { not: { field: "subtotal", op: "lt", value: 100 } },
              ],
            },
          ],
        },
        read,
      ),
    ).toBe(true);
    expect(() => evaluate({ foo: 1 }, read)).toThrow("Invalid condition node");
  });

  test("missing values only match negative operators", () => {
    expect(evaluate({ field: "region", op: "eq", value: "CA" }, read)).toBe(
      false,
    );
    expect(evaluate({ field: "region", op: "neq", value: "CA" }, read)).toBe(
      true,
    );
    expect(evaluate({ field: "region", op: "nin", value: "CA" }, read)).toBe(
      true,
    );
    expect(evaluate({ field: "coupon", op: "exists" }, read)).toBe(false);
    expect(evaluate({ field: "coupon", op: "not_exists" }, read)).toBe(true);
    expect(evaluate({ field: "groups", op: "not_exists" }, read)).toBe(true);
    expect(evaluate({ field: "country", op: "exists" }, read)).toBe(true);
    expect(evaluate({ field: "country", value: "us" }, read)).toBe(true);
  });

  test("leaves collects every comparison", () => {
    const tree = {
      all: [{ field: "a" }, { any: [{ field: "b" }] }, { not: { field: "c" } }],
    };
    expect(leaves(tree).map((leaf) => leaf.field)).toEqual(["a", "b", "c"]);
    expect(leaves(null)).toEqual([]);
  });

  test("helpers", () => {
    expect(asList(" a, b ,,c")).toEqual(["a", "b", "c"]);
    expect(asList(null)).toEqual([]);
    expect(asList(["x"])).toEqual(["x"]);
    expect(toBoolean("on")).toBe(true);
    expect(toBoolean(0)).toBe(false);
  });
});
