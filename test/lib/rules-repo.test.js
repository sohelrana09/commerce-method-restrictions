import { beforeEach, describe, expect, test } from "vitest";

import { findOneOrNull, toRule } from "../../src/common/restrictions/db.js";
import {
  clearRulesCache,
  deleteRule,
  listRules,
  listRulesCached,
  RULES_CACHE_MS,
  RuleValidationError,
  saveRule,
} from "../../src/common/restrictions/rules-repo.js";
import { createFakeDb } from "../fixtures/fake-db.js";

const rule = (overrides = {}) => ({
  action: "hide",
  code: "no-cod",
  methods: ["cashondelivery"],
  name: "No COD",
  priority: 10,
  type: "payment",
  ...overrides,
});

describe("rules repository", () => {
  let db;
  beforeEach(() => {
    db = createFakeDb();
    clearRulesCache();
  });

  test("saves, lists by type and priority, and deletes rules", async () => {
    const save = (r) => saveRule(r, {}, { connect: db.connect });
    await save(rule({ code: "b", priority: 20 }));
    await save(rule({ code: "a", priority: 10 }));
    await save(rule({ code: "c", methods: ["flatrate_*"], type: "shipping" }));
    const rules = await listRules({}, db.connect);
    expect(rules.map((r) => r.code)).toEqual(["a", "b", "c"]);
    expect(rules[0]).not.toHaveProperty("_id");
    expect(rules[0].updatedAt).toEqual(expect.any(String));
    expect(db.calls.closed).toBeGreaterThan(0);
    expect(await deleteRule("a", {}, db.connect)).toBe(true);
    expect(await deleteRule("a", {}, db.connect)).toBe(false);
  });

  test("rejects invalid rules and duplicate codes", async () => {
    await expect(
      saveRule(rule({ methods: [] }), {}, { connect: db.connect }),
    ).rejects.toBeInstanceOf(RuleValidationError);
    await saveRule(rule(), {}, { connect: db.connect });
    await expect(saveRule(rule(), {}, { connect: db.connect })).rejects.toThrow(
      'a rule with code "no-cod" already exists',
    );
  });

  test("updates in place and renames", async () => {
    await saveRule(rule(), {}, { connect: db.connect });
    await saveRule(
      rule({ name: "Renamed" }),
      {},
      { connect: db.connect, previousCode: "no-cod" },
    );
    await saveRule(
      rule({ _id: "ignored", code: "cod-off" }),
      {},
      { connect: db.connect, previousCode: "no-cod" },
    );
    const rules = await listRules({}, db.connect);
    expect(rules.map((r) => r.code)).toEqual(["cod-off"]);
  });

  test("caches rules per container until a save", async () => {
    await saveRule(rule(), {}, { connect: db.connect });
    const now = Date.now();
    const first = await listRulesCached({}, db.connect, now);
    await db
      .connect()
      .then((c) =>
        c.collection("restriction_rules").deleteOne({ code: "no-cod" }),
      );
    expect(await listRulesCached({}, db.connect, now + 1)).toBe(first);
    expect(
      await listRulesCached({}, db.connect, now + RULES_CACHE_MS + 1),
    ).toEqual([]);
  });
});

describe("db helpers", () => {
  test("findOneOrNull turns not-found errors into null", async () => {
    const missing = {
      findOne: () => Promise.reject(new Error("Document not found")),
    };
    const notFound = { findOne: () => Promise.reject({ httpStatusCode: 404 }) };
    const broken = { findOne: () => Promise.reject(new Error("boom")) };
    expect(await findOneOrNull(missing, {})).toBeNull();
    expect(await findOneOrNull(notFound, {})).toBeNull();
    await expect(findOneOrNull(broken, {})).rejects.toThrow("boom");
  });

  test("toRule strips the database id", () => {
    expect(toRule(null)).toBeNull();
    expect(toRule({ _id: 1, code: "x" })).toEqual({ code: "x" });
  });
});
