import { describe, expect, test, vi } from "vitest";

import {
  fetchProducts,
  loadCatalogEntries,
  toCatalogEntry,
} from "../../src/common/restrictions/catalog.js";
import { CATALOG } from "../../src/common/restrictions/db.js";
import {
  DEFAULT_SETTINGS,
  parseSettings,
} from "../../src/common/restrictions/settings.js";
import { createFakeDb } from "../fixtures/fake-db.js";

describe("settings", () => {
  test("defaults", () => {
    expect(parseSettings()).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("nope")).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.paymentMethods).toContain("checkmo");
  });

  test("parses stored values", () => {
    expect(
      parseSettings([
        { name: "restrictionsEnabled", value: "false" },
        { name: "paymentMethods", value: "checkmo, free" },
        { name: "shippingMethods", value: "" },
        { name: "timezone", value: "Europe/London" },
        { name: "ignored", value: null },
      ]),
    ).toEqual({
      paymentMethods: ["checkmo", "free"],
      restrictionsEnabled: false,
      shippingMethods: DEFAULT_SETTINGS.shippingMethods,
      timezone: "Europe/London",
    });
    expect(
      parseSettings([{ name: "timezone", value: "Mars/Base" }]).timezone,
    ).toBe("UTC");
    expect(
      parseSettings([{ name: "restrictionsEnabled", value: true }])
        .restrictionsEnabled,
    ).toBe(true);
    expect(
      parseSettings([{ name: "restrictionsEnabled", value: 0 }])
        .restrictionsEnabled,
    ).toBe(true);
  });
});

describe("catalog", () => {
  test("toCatalogEntry reads attributes and categories", () => {
    expect(
      toCatalogEntry({
        custom_attributes: [{ attribute_code: "hazmat", value: "1" }, {}],
        extension_attributes: { category_links: [{ category_id: "3" }] },
        type_id: "simple",
      }),
    ).toEqual({
      attributes: { hazmat: "1", type_id: "simple" },
      categoryIds: ["3"],
    });
    expect(
      toCatalogEntry({
        custom_attributes: [{ attribute_code: "category_ids", value: [4, 5] }],
      }).categoryIds,
    ).toEqual(["4", "5"]);
    expect(toCatalogEntry(undefined)).toEqual({
      attributes: {},
      categoryIds: [],
    });
  });

  test("fetchProducts batches SKUs", async () => {
    const get = vi.fn((_path, { searchParams }) => ({
      json: async () => ({
        items: searchParams[
          "searchCriteria[filter_groups][0][filters][0][value]"
        ]
          .split(",")
          .map((sku) => ({ sku })),
      }),
    }));
    const skus = Array.from({ length: 60 }, (_, i) => `S${i}`);
    expect(await fetchProducts({ get }, skus)).toHaveLength(60);
    expect(get).toHaveBeenCalledTimes(2);
  });

  test("loadCatalogEntries uses the cache, then Commerce, and survives failures", async () => {
    const db = createFakeDb();
    const now = 1000;
    db.seed(CATALOG, [
      {
        attributes: { a: 1 },
        categoryIds: ["1"],
        expiresAt: now + 10,
        sku: "CACHED",
      },
      { attributes: {}, expiresAt: now - 1, sku: "STALE" },
    ]);
    const commerce = {
      get: () => ({
        json: async () => ({
          items: [{ custom_attributes: [], sku: "STALE" }],
        }),
      }),
    };
    const logger = { warn: vi.fn() };
    const deps = {
      connect: db.connect,
      getCommerce: async () => commerce,
      logger,
      now,
    };
    expect(await loadCatalogEntries([], {}, deps)).toEqual({});
    expect(await loadCatalogEntries(["CACHED"], {}, deps)).toEqual({
      CACHED: { attributes: { a: 1 }, categoryIds: ["1"] },
    });
    const loaded = await loadCatalogEntries(
      ["CACHED", "STALE", "CACHED"],
      {},
      deps,
    );
    expect(Object.keys(loaded)).toEqual(["CACHED", "STALE"]);
    expect(
      db.collections.get(CATALOG).find((d) => d.sku === "STALE").expiresAt,
    ).toBeGreaterThan(now);

    const failing = await loadCatalogEntries(
      ["NEW"],
      {},
      {
        ...deps,
        getCommerce: async () => {
          throw new Error("down");
        },
      },
    );
    expect(failing).toEqual({});
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("down"));
    // The cached document had no categories: an empty list comes back.
    db.seed(CATALOG, [{ expiresAt: now + 10, sku: "BARE" }]);
    expect((await loadCatalogEntries(["BARE"], {}, deps)).BARE).toEqual({
      attributes: {},
      categoryIds: [],
    });
  });
});
