/**
 * Shared handler for the two checkout webhooks.
 *
 *   payment  plugin.(magento.)out_of_process_payment_methods.api.payment_method_filter.get_list
 *            answers { op: "add", path: "result", value: { code } } per hidden method
 *   shipping plugin.(magento.)out_of_process_shipping_methods.api.shipping_rate_repository.get_rates
 *            answers { op: "add", path: "result", value: { carrier_code, method, remove: true } }
 *
 * Order of checks:
 * 1. The signature. A request that isn't signed by Commerce gets a 401 and nothing else.
 * 2. Everything after that fails open: if settings, rules or product data can't be loaded, or a
 *    rule is invalid or throws, the answer is a plain success and every method stays available.
 *
 * Dependencies are injectable for tests.
 */

import {
  addOperation,
  ok,
  successOperation,
} from "@adobe/aio-commerce-sdk/webhooks/responses";
import AioLogger from "@adobe/aio-lib-core-logging";

import {
  evaluateRules,
  fromPaymentPayload,
  fromShippingPayload,
  needsProductData,
  splitShippingMethod,
  withProductData,
} from "../../common/engine/index.js";
import { json } from "../../common/http.js";
import { SignatureError, verifyWebhook } from "../../common/signature.js";

const NORMALISERS = {
  payment: fromPaymentPayload,
  shipping: fromShippingPayload,
};

function operationFor(type, code) {
  return type === "payment"
    ? addOperation("result", { code })
    : addOperation("result", { ...splitShippingMethod(code), remove: true });
}

/* v8 ignore start: production wiring; tests inject fakes */
async function realDeps() {
  const [{ listRulesCached }, { loadSettings }, catalog, lib] =
    await Promise.all([
      import("../../common/restrictions/rules-repo.js"),
      import("../../common/restrictions/settings.js"),
      import("../../common/restrictions/catalog.js"),
      import("@adobe/aio-commerce-lib-app"),
    ]);
  const { resolveImsAuthParams } = await import("@adobe/aio-commerce-lib-auth");
  return {
    listRules: (params) => listRulesCached(params),
    loadCatalog: (skus, params, logger) =>
      catalog.loadCatalogEntries(skus, params, {
        getCommerce: (p) => lib.getCommerceClient(resolveImsAuthParams(p)),
        logger,
      }),
    loadSettings,
    now: () => new Date(),
  };
}
/* v8 ignore stop */

/** Works out which methods to hide. Throws on infrastructure errors; the caller fails open. */
export async function restrict(type, body, params, deps, logger) {
  const settings = await deps.loadSettings(logger);
  if (!settings.restrictionsEnabled) {
    return { hidden: [], status: "disabled" };
  }
  const rules = (await deps.listRules(params)).filter(
    (rule) => rule.type === type && rule.enabled !== false,
  );
  if (!rules.length) {
    return { hidden: [], status: "no_rules" };
  }

  let context = NORMALISERS[type](body);
  if (needsProductData(rules, type)) {
    const missing = context.items.filter(
      (item) => item.categoryIds === undefined,
    );
    if (missing.length) {
      const catalog = await deps.loadCatalog(
        missing.map((item) => item.sku),
        params,
        logger,
      );
      context = withProductData(context, catalog);
    }
  }

  const result = evaluateRules(rules, context, {
    methods:
      type === "payment" ? settings.paymentMethods : settings.shippingMethods,
    now: deps.now(),
    timeZone: settings.timezone,
    type,
  });
  if (result.failedOpen) {
    logger.error(`Hiding no ${type} methods: ${result.error}`);
    return { hidden: [], status: "failed_open" };
  }
  if (result.safeguard) {
    logger.warn(
      `The ${type} rules would hide every method; hiding none instead`,
    );
    return { hidden: [], status: "safeguard" };
  }
  return {
    hidden: result.hidden.map((entry) => entry.code),
    status: result.hidden.length ? "hidden" : "none",
  };
}

/** `overrides` replaces every dependency (tests); without it the real ones load on first use. */
export function createWebhookAction(type, overrides = {}) {
  return async (params = {}) => {
    const logger = AioLogger(`method-restrictions-${type}`, {
      level: params.LOG_LEVEL || "info",
    });

    let body;
    try {
      body = verifyWebhook(params);
    } catch (error) {
      if (error instanceof SignatureError) {
        logger.warn(`Rejected ${type} webhook: ${error.message}`);
        return json(401, { error: "Unauthorized" });
      }
      /* v8 ignore next 3: verifyWebhook only throws SignatureError */
      logger.error(`Signature check failed: ${error.message}`);
      return json(401, { error: "Unauthorized" });
    }

    try {
      const deps = Object.keys(overrides).length ? overrides : await realDeps();
      const { hidden, status } = await restrict(
        type,
        body,
        params,
        deps,
        logger,
      );
      logger.debug(`${type}: ${status} ${hidden.join(", ")}`);
      if (!hidden.length) {
        return ok([successOperation()]);
      }
      return ok(hidden.map((code) => operationFor(type, code)));
    } catch (error) {
      logger.error(
        `Error in ${type} restrictions, hiding nothing: ${error.message}`,
      );
      return ok([successOperation()]);
    }
  };
}
