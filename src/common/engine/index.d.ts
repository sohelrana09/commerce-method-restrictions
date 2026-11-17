// Types for the rule engine (index.js), used by the Admin page.

export type RuleType = "payment" | "shipping";
export type RuleAction = "hide" | "allow_only";
export type FieldType = "number" | "text" | "boolean" | "time" | "day";

export type ConditionLeaf = {
  field: string;
  op: string;
  value?: string | number | boolean;
};

export type ConditionNode =
  | ConditionLeaf
  | { all: ConditionNode[] }
  | { any: ConditionNode[] }
  | { not: ConditionNode };

export type Rule = {
  code: string;
  name: string;
  type: RuleType;
  action: RuleAction;
  methods: string[];
  enabled?: boolean;
  priority?: number;
  conditions?: ConditionNode;
  activeFrom?: string;
  activeTo?: string;
  stopFurther?: boolean;
  note?: string;
  updatedAt?: string;
};

export type CartItem = {
  sku: string;
  qty: number;
  price: number;
  rowTotal: number;
  weight: number;
  categoryIds?: string[];
  attributes?: Record<string, unknown>;
  isChild?: boolean;
};

export type CheckoutContext = {
  availableMethods?: string[];
  customerGroup?: string;
  isGuest?: boolean;
  subtotal?: number;
  qty?: number;
  itemCount?: number;
  weight?: number;
  country?: string;
  region?: string;
  postcode?: string;
  city?: string;
  storeId?: string;
  couponCode?: string;
  items?: CartItem[];
};

export type Reason = { rule: string; name: string; action: RuleAction };
export type HiddenMethod = { code: string; reasons: Reason[] };

export type TraceEntry = {
  code: string;
  name: string;
  priority: number;
  status?: "applied" | "not_matched" | "off" | "inactive" | "skipped";
  detail?: string;
  hides: string[];
};

export type Evaluation = {
  type: RuleType;
  available: string[];
  hidden: HiddenMethod[];
  trace: TraceEntry[];
  failedOpen: boolean;
  safeguard: boolean;
  error?: string;
};

export declare const ATTRIBUTE_PREFIX: "attr.";
export declare const RULE_TYPES: RuleType[];
export declare const ACTIONS: RuleAction[];
export declare const MAX_METHODS: number;
export declare const MAX_CONDITIONS: number;
export declare const FIELDS: Record<string, FieldType>;
export declare const OPERATORS: Record<FieldType, string[]>;
export declare const WEEKDAYS: string[];

export declare function asList(value: unknown): string[];
export declare function parseTime(value: unknown): number | undefined;
export declare function toBoolean(value: unknown): boolean;
export declare function toNumber(value: unknown, fallback?: number): number;
export declare function fieldType(field: string): FieldType | undefined;
export declare function isProductField(field: string): boolean;
export declare function validateRule(rule: unknown): string[];
export declare function methodMatches(pattern: string, code: string): boolean;
export declare function isActive(rule: Rule, today: string): boolean;
export declare function splitShippingMethod(code: string): {
  carrier_code: string;
  method: string;
};
export declare function parseMethodList(value: unknown): string[];
export declare function needsProductData(
  rules: Rule[],
  type?: RuleType,
): boolean;
export declare function clock(
  now?: Date,
  timeZone?: string,
): { date: string; minutes: number; weekday: string };
export type Clock = { date: string; minutes: number; weekday: string };
export declare function clockAt(date: string, time?: string): Clock | undefined;
export declare function fromPaymentPayload(params: unknown): CheckoutContext;
export declare function fromShippingPayload(params: unknown): CheckoutContext;
export declare function withProductData(
  context: CheckoutContext,
  catalog?: Record<
    string,
    { attributes?: Record<string, unknown>; categoryIds?: unknown[] }
  >,
): CheckoutContext;
export declare function evaluateRules(
  rules: Rule[],
  context: CheckoutContext,
  options?: {
    type?: RuleType;
    methods?: string[];
    now?: Date;
    timeZone?: string;
    clock?: Clock;
  },
): Evaluation;
