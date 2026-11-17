import type { RuleType } from "#engine";

export type { ConditionLeaf, Rule, RuleAction, RuleType } from "#engine";

export type MatchMode = "all" | "any";

export type Option = { id: string; label: string };
export type StoreView = { code: string; id: string; label: string };

export type Lookups = {
  customerGroups: Option[];
  storeViews: StoreView[];
  paymentMethods: string[];
  shippingMethods: string[];
  timezone: string;
  unavailable?: boolean;
};

/** The made-up checkout the "Test a cart" simulator runs the rules against. */
export type SampleCart = {
  type: RuleType;
  customerGroup: string;
  isGuest: boolean;
  storeId: string;
  country: string;
  region: string;
  postcode: string;
  city: string;
  couponCode: string;
  /** Store-local date and time, YYYY-MM-DD and HH:MM. */
  date: string;
  time: string;
  /** One item per line: SKU | qty | price | weight | category IDs | code=value; code=value */
  items: string;
};
