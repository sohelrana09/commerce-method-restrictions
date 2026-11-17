/**
 * Example rules the Admin offers as starting points ("Start from example"). They are never applied
 * on their own: a merchant copies one, adjusts it and switches it on.
 */

export const DEFAULT_RULES = [
  {
    action: "hide",
    code: "no-cod-over-500",
    conditions: { all: [{ field: "subtotal", op: "gt", value: 500 }] },
    enabled: false,
    methods: ["cashondelivery"],
    name: "No cash on delivery over 500",
    priority: 10,
    type: "payment",
  },
  {
    action: "hide",
    code: "no-po-for-guests",
    conditions: {
      all: [{ field: "customer_is_guest", op: "eq", value: true }],
    },
    enabled: false,
    methods: ["purchaseorder"],
    name: "Purchase orders for signed-in customers only",
    priority: 20,
    type: "payment",
  },
  {
    action: "allow_only",
    code: "wholesale-invoice-only",
    conditions: { all: [{ field: "customer_group", op: "in", value: "2" }] },
    enabled: false,
    methods: ["checkmo", "purchaseorder", "banktransfer"],
    name: "Wholesale pays by invoice",
    priority: 30,
    type: "payment",
  },
  {
    action: "hide",
    code: "free-shipping-mainland-us",
    conditions: {
      any: [
        { field: "country", op: "neq", value: "US" },
        { field: "region", op: "in", value: "AK, HI, PR" },
      ],
    },
    enabled: false,
    methods: ["freeshipping_freeshipping"],
    name: "Free shipping in the mainland US only",
    priority: 10,
    type: "shipping",
  },
  {
    action: "hide",
    code: "no-flat-rate-heavy",
    conditions: { all: [{ field: "weight", op: "gt", value: 30 }] },
    enabled: false,
    methods: ["flatrate_*"],
    name: "No flat rate for carts over 30 kg",
    priority: 20,
    type: "shipping",
  },
  {
    action: "hide",
    code: "hazmat-ground-only",
    conditions: { all: [{ field: "attr.hazmat", op: "eq", value: "1" }] },
    enabled: false,
    methods: ["ups_1DA", "ups_2DA", "fedex_PRIORITY_OVERNIGHT", "dhl_*"],
    name: "Hazardous goods ship by ground",
    priority: 30,
    type: "shipping",
  },
  {
    action: "hide",
    code: "no-express-weekend",
    conditions: {
      any: [
        { field: "day_of_week", op: "in", value: "fri, sat, sun" },
        { field: "time", op: "gte", value: "15:00" },
      ],
    },
    enabled: false,
    methods: ["ups_1DA"],
    name: "No next-day air after 3 pm or at the weekend",
    priority: 40,
    type: "shipping",
  },
];
