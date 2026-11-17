/**
 * Admin action handlers: manage restriction rules, and load what the rule editor offers (store
 * views, customer groups, the store's method lists). The "Test a cart" simulator runs in the
 * browser with the same engine as the webhooks, so there's no simulate action. Dependencies are
 * injectable for tests.
 */

import { getCommerceClient } from "@adobe/aio-commerce-lib-app";
import { resolveImsAuthParams } from "@adobe/aio-commerce-lib-auth";

import { json } from "../../common/http.js";
import { DEFAULT_RULES } from "../../common/restrictions/default-rules.js";
import {
  deleteRule,
  listRules,
  RuleValidationError,
  saveRule,
} from "../../common/restrictions/rules-repo.js";
import { loadSettings } from "../../common/restrictions/settings.js";

/* v8 ignore next 3: production wiring */
function getCommerce(params) {
  return getCommerceClient(resolveImsAuthParams(params));
}

const realDeps = { deleteRule, getCommerce, listRules, loadSettings, saveRule };

function requireCode(code) {
  if (typeof code !== "string" || !code) {
    throw new RuleValidationError(["code is required"]);
  }
  return code;
}

async function readList(commerce, path, logger) {
  try {
    return await commerce.get(path).json();
  } catch (error) {
    logger.warn(`${path} unavailable: ${error.message}`);
    return null;
  }
}

export function createHandlers(overrides = {}) {
  const deps = { ...realDeps, ...overrides };

  return {
    async lookups(_body, params, logger) {
      const settings = await deps.loadSettings(logger);
      const base = {
        paymentMethods: settings.paymentMethods,
        shippingMethods: settings.shippingMethods,
        timezone: settings.timezone,
      };
      let commerce;
      try {
        commerce = await deps.getCommerce(params);
      } catch (error) {
        // The editor still works with typed IDs when Commerce can't be reached.
        logger.warn(`lookups unavailable: ${error.message}`);
        return json(200, {
          ...base,
          customerGroups: [],
          storeViews: [],
          unavailable: true,
        });
      }
      const [storeViews, groups] = await Promise.all([
        readList(commerce, "store/storeViews", logger),
        readList(
          commerce,
          "customerGroups/search?searchCriteria[pageSize]=200",
          logger,
        ),
      ]);
      return json(200, {
        ...base,
        customerGroups: (groups?.items ?? []).map((g) => ({
          id: String(g.id),
          label: g.code,
        })),
        storeViews: (storeViews ?? [])
          .filter((s) => Number(s.id) !== 0)
          .map((s) => ({ code: s.code, id: String(s.id), label: s.name })),
        ...(storeViews && groups ? {} : { unavailable: true }),
      });
    },

    async ruleDelete(body, params) {
      const deleted = await deps.deleteRule(requireCode(body.code), params);
      return deleted
        ? json(200, { deleted: true })
        : json(404, { error: "Rule not found" });
    },

    async ruleSave(body, params) {
      if (!body.rule || typeof body.rule !== "object") {
        throw new RuleValidationError(["rule is required"]);
      }
      const saved = await deps.saveRule(body.rule, params, {
        previousCode: body.previousCode,
      });
      return json(200, { rule: saved });
    },

    async rulesList(_body, params) {
      const rules = await deps.listRules(params);
      return json(200, { examples: DEFAULT_RULES, rules });
    },
  };
}

export const handlers = createHandlers();
