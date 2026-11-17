/**
 * App-wide settings from the App Management configuration form (businessConfig in
 * app.commerce.config.ts), read at the global scope. Missing or unreadable settings fall back to
 * the defaults, so a fresh install behaves predictably.
 */

import { parseMethodList } from "../engine/index.js";
import {
  DEFAULT_PAYMENT_METHODS as PAYMENT,
  DEFAULT_SHIPPING_METHODS as SHIPPING,
} from "./settings-defaults.js";

export {
  DEFAULT_PAYMENT_METHODS,
  DEFAULT_SHIPPING_METHODS,
} from "./settings-defaults.js";

export const DEFAULT_SETTINGS = {
  paymentMethods: parseMethodList(PAYMENT),
  restrictionsEnabled: true,
  shippingMethods: parseMethodList(SHIPPING),
  timezone: "UTC",
};

function toBool(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return fallback;
}

function toTimeZone(value) {
  const zone = typeof value === "string" ? value.trim() : "";
  if (!zone) {
    return DEFAULT_SETTINGS.timezone;
  }
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
    }).resolvedOptions().timeZone;
  } catch {
    return DEFAULT_SETTINGS.timezone;
  }
}

function toMethods(value, fallback) {
  const list = parseMethodList(value);
  return list.length ? list : [...fallback];
}

/** Turns stored config entries ([{ name, value }]) into typed settings. */
export function parseSettings(entries = []) {
  const raw = Object.fromEntries(
    (Array.isArray(entries) ? entries : [])
      .filter((entry) => entry?.value !== undefined && entry?.value !== null)
      .map((entry) => [entry.name, entry.value]),
  );
  return {
    paymentMethods: toMethods(
      raw.paymentMethods,
      DEFAULT_SETTINGS.paymentMethods,
    ),
    restrictionsEnabled: toBool(
      raw.restrictionsEnabled,
      DEFAULT_SETTINGS.restrictionsEnabled,
    ),
    shippingMethods: toMethods(
      raw.shippingMethods,
      DEFAULT_SETTINGS.shippingMethods,
    ),
    timezone: toTimeZone(raw.timezone),
  };
}

/* v8 ignore start: reads App Management configuration, which needs a deployed app */
export async function loadSettings(logger = console) {
  try {
    const [{ default: appConfig }, libConfig] = await Promise.all([
      import("#app.commerce.config"),
      import("@adobe/aio-commerce-lib-config"),
    ]);
    await libConfig.initialize({ schema: appConfig.businessConfig.schema });
    const result = await libConfig.getConfiguration(
      libConfig.byCodeAndLevel("global", "global"),
    );
    return parseSettings(result?.config);
  } catch (error) {
    logger.warn(`Using default settings: ${error.message}`);
    return structuredClone(DEFAULT_SETTINGS);
  }
}
/* v8 ignore stop */
