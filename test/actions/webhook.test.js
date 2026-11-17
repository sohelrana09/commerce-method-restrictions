import { describe, expect, test, vi } from "vitest";

import { main as filterPayment } from "../../src/commerce-extensibility-1/actions/filter-payment/index.js";
import { main as filterShipping } from "../../src/commerce-extensibility-1/actions/filter-shipping/index.js";
import {
  createWebhookAction,
  restrict,
} from "../../src/commerce-extensibility-1/actions/webhook.js";
import { signedParams } from "../fixtures/signing.js";

const settings = {
  paymentMethods: ["checkmo", "cashondelivery", "purchaseorder"],
  restrictionsEnabled: true,
  shippingMethods: ["flatrate_flatrate", "ups_GND", "ups_1DA"],
  timezone: "UTC",
};

const paymentBody = {
  payload: {
    cart: {
      base_subtotal: 600,
      items: [{ price: 300, qty: 2, sku: "A" }],
      store_id: 1,
    },
    customer: { entity_id: 1, group_id: 1 },
  },
};

const shippingBody = {
  rateRequest: {
    all_items: [{ price: 20, qty: 1, sku: "HAZ", weight: 2 }],
    dest_country_id: "US",
    package_weight: 2,
  },
};

const rules = [
  {
    action: "hide",
    code: "no-cod",
    conditions: { all: [{ field: "subtotal", op: "gt", value: 500 }] },
    methods: ["cashondelivery"],
    name: "No COD",
    type: "payment",
  },
  {
    action: "hide",
    code: "hazmat",
    conditions: { all: [{ field: "attr.hazmat", op: "eq", value: "1" }] },
    methods: ["ups_1DA"],
    name: "Hazmat",
    type: "shipping",
  },
];

function deps(overrides = {}) {
  return {
    listRules: vi.fn(async () => rules),
    loadCatalog: vi.fn(async () => ({
      HAZ: { attributes: { hazmat: "1" }, categoryIds: [] },
    })),
    loadSettings: vi.fn(async () => settings),
    now: () => new Date("2026-11-18T12:00:00Z"),
    ...overrides,
  };
}

describe("webhook actions", () => {
  test("hide payment methods with add operations", async () => {
    const action = createWebhookAction("payment", deps());
    const response = await action(signedParams(paymentBody));
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([
      { op: "add", path: "result", value: { code: "cashondelivery" } },
    ]);
  });

  test("remove shipping methods, looking up product data when needed", async () => {
    const d = deps();
    const response = await createWebhookAction(
      "shipping",
      d,
    )(signedParams(shippingBody));
    expect(response.body).toEqual([
      {
        op: "add",
        path: "result",
        value: { carrier_code: "ups", method: "1DA", remove: true },
      },
    ]);
    expect(d.loadCatalog).toHaveBeenCalledWith(
      ["HAZ"],
      expect.any(Object),
      expect.any(Object),
    );
  });

  test("reject unsigned and forged requests without touching the rules", async () => {
    const d = deps();
    const action = createWebhookAction("payment", d);
    const unsigned = await action({
      ...signedParams(paymentBody),
      __ow_headers: {},
    });
    expect(unsigned.statusCode).toBe(401);
    expect(unsigned.body).toEqual({ error: "Unauthorized" });
    const noKey = await action(
      signedParams(paymentBody, { COMMERCE_WEBHOOKS_PUBLIC_KEY: "" }),
    );
    expect(noKey.statusCode).toBe(401);
    expect(d.listRules).not.toHaveBeenCalled();
    // The real entry points reject before loading anything.
    expect((await filterPayment({})).statusCode).toBe(401);
    expect((await filterShipping({})).statusCode).toBe(401);
  });

  test("fail open when loading rules throws", async () => {
    const action = createWebhookAction(
      "payment",
      deps({
        listRules: async () => {
          throw new Error("db down");
        },
      }),
    );
    expect((await action(signedParams(paymentBody))).body).toEqual([
      { op: "success" },
    ]);
  });

  test("fail open when a rule is invalid", async () => {
    const broken = [{ ...rules[0], methods: [] }];
    const action = createWebhookAction(
      "payment",
      deps({ listRules: async () => broken }),
    );
    expect((await action(signedParams(paymentBody))).body).toEqual([
      { op: "success" },
    ]);
  });
});

describe("restrict", () => {
  const logger = { error: vi.fn(), warn: vi.fn() };

  test("does nothing when switched off or without rules", async () => {
    expect(
      await restrict(
        "payment",
        paymentBody,
        {},
        deps({
          loadSettings: async () => ({
            ...settings,
            restrictionsEnabled: false,
          }),
        }),
        logger,
      ),
    ).toEqual({ hidden: [], status: "disabled" });
    expect(
      await restrict(
        "payment",
        paymentBody,
        {},
        deps({ listRules: async () => [{ ...rules[0], enabled: false }] }),
        logger,
      ),
    ).toEqual({ hidden: [], status: "no_rules" });
  });

  test("reports nothing to hide, the safeguard, and skips lookups when the payload has product data", async () => {
    const cheap = {
      payload: { cart: { base_subtotal: 10, items: [{ qty: 1, sku: "A" }] } },
    };
    expect(await restrict("payment", cheap, {}, deps(), logger)).toEqual({
      hidden: [],
      status: "none",
    });

    const all = [
      {
        ...rules[0],
        action: "allow_only",
        conditions: undefined,
        methods: ["nothing"],
      },
    ];
    expect(
      await restrict(
        "payment",
        paymentBody,
        {},
        deps({ listRules: async () => all }),
        logger,
      ),
    ).toEqual({ hidden: [], status: "safeguard" });
    expect(logger.warn).toHaveBeenCalled();

    const d = deps();
    const withData = {
      rateRequest: {
        all_items: [
          {
            product: { attributes: { hazmat: "1" }, category_ids: "" },
            qty: 1,
            sku: "HAZ",
          },
        ],
      },
    };
    expect(await restrict("shipping", withData, {}, d, logger)).toEqual({
      hidden: ["ups_1DA"],
      status: "hidden",
    });
    expect(d.loadCatalog).not.toHaveBeenCalled();
  });

  test("fails open on invalid rules", async () => {
    const result = await restrict(
      "payment",
      paymentBody,
      {},
      deps({ listRules: async () => [{ ...rules[0], methods: [] }] }),
      logger,
    );
    expect(result).toEqual({ hidden: [], status: "failed_open" });
    expect(logger.error).toHaveBeenCalled();
  });
});
