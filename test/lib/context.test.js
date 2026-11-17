import { describe, expect, test } from "vitest";

import {
  fromPaymentPayload,
  fromShippingPayload,
  normaliseItem,
  toNumber,
} from "../../src/common/engine/context.js";

describe("payment payload", () => {
  test("reads the cart, customer and shipping address", () => {
    const context = fromPaymentPayload({
      payload: {
        cart: {
          base_subtotal: "150.50",
          coupon_code: "SAVE10",
          items: [
            {
              item_id: "1",
              product: {
                attributes: { brand: "Acme", category_ids: "3,7" },
                sku: "A",
                weight: "2",
              },
              qty: 2,
              price: "50",
            },
            { parent_item_id: "1", qty: 2, sku: "A-child" },
            { qty: 0, sku: "gone" },
            null,
            { base_row_total: 50.5, category_ids: [4], qty: 1, sku: "B" },
          ],
          shipping_address: {
            city: "Leeds",
            country_id: "GB",
            postcode: "LS1 4AP",
            region_code: "WYK",
          },
          store_id: 2,
        },
        customer: { entity_id: "9", group_id: 3 },
        payment_methods: [{ code: "checkmo" }, "free", { title: "no code" }],
      },
    });
    expect(context).toMatchObject({
      availableMethods: ["checkmo", "free"],
      city: "Leeds",
      country: "GB",
      couponCode: "SAVE10",
      customerGroup: "3",
      isGuest: false,
      itemCount: 2,
      postcode: "LS1 4AP",
      qty: 3,
      region: "WYK",
      storeId: "2",
      subtotal: 150.5,
      weight: 4,
    });
    expect(context.items[0]).toMatchObject({
      attributes: { brand: "Acme" },
      categoryIds: ["3", "7"],
      rowTotal: 100,
      sku: "A",
    });
    expect(context.items[1]).toMatchObject({
      categoryIds: ["4"],
      rowTotal: 50.5,
      sku: "B",
    });
  });

  test("guests, missing data and other address shapes", () => {
    const guest = fromPaymentPayload({
      payload: {
        cart: {
          customer_group_id: 0,
          extension_attributes: {
            shipping_assignments: [
              { shipping: { address: { country_id: "FR" } } },
            ],
          },
          items: [
            {
              product: {
                custom_attributes: [
                  { attribute_code: "color", value: "red" },
                  {},
                ],
                extension_attributes: { category_links: [{ category_id: 5 }] },
              },
              qty: 1,
              sku: "C",
            },
          ],
        },
        customer: null,
      },
    });
    expect(guest).toMatchObject({
      availableMethods: [],
      country: "FR",
      customerGroup: "0",
      isGuest: true,
      subtotal: 0,
    });
    expect(guest.items[0]).toMatchObject({
      attributes: { color: "red" },
      categoryIds: ["5"],
    });

    const listed = fromPaymentPayload({
      payload: {
        cart: {
          addresses: [
            { address_type: "billing", country_id: "DE" },
            { address_type: "shipping", country_id: "AT" },
          ],
          customer_is_guest: "1",
        },
      },
    });
    expect(listed).toMatchObject({
      country: "AT",
      isGuest: true,
      itemCount: 0,
    });
    expect(
      fromPaymentPayload({
        payload: { cart: { billing_address: { country: "ES" } } },
      }).country,
    ).toBe("ES");
    expect(fromPaymentPayload().items).toEqual([]);
    expect(fromPaymentPayload({ cart: { items: "nope" } }).items).toEqual([]);
  });
});

describe("shipping payload", () => {
  test("reads the rate request", () => {
    const context = fromShippingPayload({
      rateRequest: {
        all_items: [
          {
            product: { attributes: { hazmat: "1" }, sku: "A" },
            qty: 2,
            sku: "A",
            weight: 3,
          },
        ],
        customer: { group_id: "2", id: 4 },
        dest_city: "Austin",
        dest_country_id: "US",
        dest_postcode: "73301",
        dest_region_code: "TX",
        package_qty: 2,
        package_value: 100,
        package_value_with_discount: 90,
        package_weight: 6,
        store_id: 1,
      },
    });
    expect(context).toMatchObject({
      availableMethods: [],
      city: "Austin",
      country: "US",
      customerGroup: "2",
      isGuest: false,
      postcode: "73301",
      qty: 2,
      region: "TX",
      storeId: "1",
      subtotal: 90,
      weight: 6,
    });
    expect(context.items[0].categoryIds).toBeUndefined();
  });

  test("falls back to the items when package totals are missing", () => {
    const context = fromShippingPayload({
      rateRequest: {
        all_items: [{ price: 10, qty: 3, sku: "X", weight: 1 }],
        dest_region_id: 12,
      },
    });
    expect(context).toMatchObject({
      isGuest: true,
      qty: 3,
      region: "12",
      subtotal: 30,
      weight: 3,
    });
    expect(fromShippingPayload().items).toEqual([]);
    expect(
      fromShippingPayload({
        rate_request: { coupon_code: "X", customer_group_id: 1 },
      }),
    ).toMatchObject({ couponCode: "X", customerGroup: "1" });
  });
});

test("helpers", () => {
  expect(toNumber("3.5")).toBe(3.5);
  expect(toNumber("", 7)).toBe(7);
  expect(toNumber(null, 1)).toBe(1);
  expect(toNumber("x")).toBe(0);
  expect(normaliseItem({ quantity: 2, sku: "Q" })).toMatchObject({
    qty: 2,
    rowTotal: 0,
    sku: "Q",
  });
});
