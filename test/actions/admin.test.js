import { describe, expect, test, vi } from "vitest";

import { createHandlers } from "../../src/commerce-backend-ui-2/actions/handlers.js";
import { adminAction } from "../../src/commerce-backend-ui-2/actions/http.js";
import { json, readBody } from "../../src/common/http.js";
import { RuleValidationError } from "../../src/common/restrictions/rules-repo.js";

const logger = { error: vi.fn(), warn: vi.fn() };
const settings = async () => ({
  paymentMethods: ["checkmo"],
  shippingMethods: ["flatrate_flatrate"],
  timezone: "UTC",
});

describe("admin handlers", () => {
  test("rulesList returns rules and examples", async () => {
    const handlers = createHandlers({ listRules: async () => [{ code: "a" }] });
    const response = await handlers.rulesList({}, {});
    expect(response.body.rules).toEqual([{ code: "a" }]);
    expect(response.body.examples.length).toBeGreaterThan(0);
    expect(response.body.examples.every((e) => e.enabled === false)).toBe(true);
  });

  test("ruleSave validates input and passes the previous code", async () => {
    const saveRule = vi.fn(async (rule) => rule);
    const handlers = createHandlers({ saveRule });
    await expect(handlers.ruleSave({}, {})).rejects.toBeInstanceOf(
      RuleValidationError,
    );
    const response = await handlers.ruleSave(
      { previousCode: "old", rule: { code: "new" } },
      {},
    );
    expect(response.body.rule).toEqual({ code: "new" });
    expect(saveRule).toHaveBeenCalledWith(
      { code: "new" },
      {},
      { previousCode: "old" },
    );
  });

  test("ruleDelete answers 404 for a missing rule", async () => {
    const handlers = createHandlers({
      deleteRule: async (code) => code === "a",
    });
    expect((await handlers.ruleDelete({ code: "a" }, {})).statusCode).toBe(200);
    expect((await handlers.ruleDelete({ code: "b" }, {})).statusCode).toBe(404);
    await expect(handlers.ruleDelete({}, {})).rejects.toBeInstanceOf(
      RuleValidationError,
    );
  });

  test("lookups lists store views, customer groups and method lists", async () => {
    const data = {
      "customerGroups/search?searchCriteria[pageSize]=200": {
        items: [{ code: "General", id: 1 }],
      },
      "store/storeViews": [
        { code: "admin", id: 0, name: "Admin" },
        { code: "default", id: 1, name: "Default" },
      ],
    };
    const handlers = createHandlers({
      getCommerce: async () => ({
        get: (path) => ({ json: async () => data[path] }),
      }),
      loadSettings: settings,
    });
    expect((await handlers.lookups({}, {}, logger)).body).toEqual({
      customerGroups: [{ id: "1", label: "General" }],
      paymentMethods: ["checkmo"],
      shippingMethods: ["flatrate_flatrate"],
      storeViews: [{ code: "default", id: "1", label: "Default" }],
      timezone: "UTC",
    });
  });

  test("lookups degrades when Commerce or one list is unreachable", async () => {
    const down = createHandlers({
      getCommerce: async () => {
        throw new Error("no auth");
      },
      loadSettings: settings,
    });
    expect((await down.lookups({}, {}, logger)).body).toMatchObject({
      customerGroups: [],
      storeViews: [],
      unavailable: true,
    });
    const partial = createHandlers({
      getCommerce: async () => ({
        get: (path) => ({
          json: async () => {
            if (path.startsWith("customerGroups")) {
              throw new Error("403");
            }
            return [];
          },
        }),
      }),
      loadSettings: settings,
    });
    expect((await partial.lookups({}, {}, logger)).body).toMatchObject({
      customerGroups: [],
      unavailable: true,
    });
  });
});

describe("adminAction", () => {
  test("returns 400 for validation errors and 500 for others", async () => {
    const invalid = adminAction("x", () => {
      throw new RuleValidationError(["bad"]);
    });
    expect((await invalid({ body: "{}" })).statusCode).toBe(400);
    const broken = adminAction("x", () => {
      throw new Error("secret detail");
    });
    const response = await broken({});
    expect(response.statusCode).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain("secret detail");
    const okAction = adminAction("x", (body) => json(200, body));
    expect((await okAction({ body: { a: 1 } })).body).toEqual({ a: 1 });
  });

  test("readBody handles strings, objects and flattened params", () => {
    expect(readBody({ body: '{"a":1}' })).toEqual({ a: 1 });
    expect(readBody({ body: "not json" })).toEqual({});
    expect(readBody({ __ow_method: "post", a: 2 })).toEqual({ a: 2 });
    expect(readBody()).toEqual({});
  });
});
