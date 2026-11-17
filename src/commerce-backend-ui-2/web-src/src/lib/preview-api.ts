import { validateRule } from "#engine";

import { DEFAULT_RULES } from "../../../../common/restrictions/default-rules.js";
import {
  DEFAULT_PAYMENT_METHODS,
  DEFAULT_SHIPPING_METHODS,
} from "../../../../common/restrictions/settings-defaults.js";
import { ApiError } from "../hooks/use-restrictions-api.ts";

import type { RestrictionsApi } from "../hooks/use-restrictions-api.ts";
import type { Rule } from "./types.ts";

const STORAGE_KEY = "method-restrictions-preview:rules";

const split = (text: string) =>
  text
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);

/** The examples, switched on, so the preview opens with something to try. */
export function seedRules(): Rule[] {
  return (DEFAULT_RULES as Rule[]).map((rule) => ({
    ...structuredClone(rule),
    enabled: true,
  }));
}

function read(): Rule[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as Rule[];
    }
  } catch {
    // Storage blocked or corrupt: start from the examples.
  }
  return seedRules();
}

function write(rules: Rule[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // Storage blocked: changes last until the page reloads.
  }
}

function sorted(rules: Rule[]): Rule[] {
  return [...rules].sort(
    (a, b) =>
      a.type.localeCompare(b.type) ||
      (a.priority ?? 0) - (b.priority ?? 0) ||
      a.code.localeCompare(b.code),
  );
}

const wait = () => new Promise((resolve) => setTimeout(resolve, 150));

/**
 * The Admin API without App Builder: rules live in this browser's localStorage and are checked
 * with the same validateRule as the rule-save action. For local preview only.
 */
export function createPreviewApi(): RestrictionsApi {
  let rules = read();

  return {
    async deleteRule(code) {
      await wait();
      const before = rules.length;
      rules = rules.filter((rule) => rule.code !== code);
      write(rules);
      return { deleted: rules.length < before };
    },

    async listRules() {
      await wait();
      return {
        examples: structuredClone(DEFAULT_RULES as Rule[]),
        rules: sorted(structuredClone(rules)),
      };
    },

    async lookups() {
      await wait();
      return {
        customerGroups: [
          { id: "0", label: "NOT LOGGED IN" },
          { id: "1", label: "General" },
          { id: "2", label: "Wholesale" },
          { id: "3", label: "Retailer" },
        ],
        paymentMethods: split(DEFAULT_PAYMENT_METHODS),
        shippingMethods: [...split(DEFAULT_SHIPPING_METHODS), "ups_1DA"],
        storeViews: [
          { code: "default", id: "1", label: "Default Store View" },
          { code: "fr", id: "2", label: "French Store View" },
        ],
        timezone: "UTC",
      };
    },

    async saveRule(rule, previousCode) {
      await wait();
      const errors = validateRule(rule);
      if (errors.length) {
        throw new ApiError(`Invalid rule: ${errors.join("; ")}`, errors);
      }
      const renamed = previousCode && previousCode !== rule.code;
      if (
        (renamed || !previousCode) &&
        rules.some((existing) => existing.code === rule.code)
      ) {
        throw new ApiError("Invalid rule", [
          `a rule with code "${rule.code}" already exists`,
        ]);
      }
      const saved = { ...rule, updatedAt: new Date().toISOString() };
      rules = [
        ...rules.filter(
          (existing) =>
            existing.code !== rule.code && existing.code !== previousCode,
        ),
        saved,
      ];
      write(rules);
      return { rule: saved };
    },
  };
}

/** Puts the examples back and forgets the preview's changes. */
export function resetPreview() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}
