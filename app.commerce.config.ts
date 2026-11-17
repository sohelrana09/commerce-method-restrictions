import { defineConfig } from "@adobe/aio-commerce-lib-app/config";

// Both webhooks are "after" plugins: Commerce has built its list of methods and asks the app which
// ones to take away. They aren't required, and the actions fail open, so an outage of this app never
// blocks a checkout: every method simply stays available.
const paymentWebhook = {
  batch_name: "method_restrictions",
  fallback_error_message:
    "We couldn't check the payment methods for your cart. Please try again.",
  fields: [{ name: "payload" }],
  hook_name: "payment_method_restrictions",
  method: "POST",
  required: false,
  soft_timeout: 1000,
  timeout: 3000,
  webhook_type: "after",
};

const shippingWebhook = {
  batch_name: "method_restrictions",
  fallback_error_message:
    "We couldn't check the shipping methods for your cart. Please try again.",
  fields: [{ name: "rateRequest" }],
  hook_name: "shipping_method_restrictions",
  method: "POST",
  required: false,
  soft_timeout: 1000,
  timeout: 3000,
  webhook_type: "after",
};

export default defineConfig({
  adminUi: {
    menu: {
      aclProtected: true,
      description:
        "Create rules that hide, or allow only, payment and shipping methods at checkout.",
      id: "method_restrictions",
      label: "Method Restrictions",
    },
  },

  businessConfig: {
    schema: [
      {
        default: true,
        label: "Apply payment and shipping method restrictions",
        name: "restrictionsEnabled",
        type: "boolean",
      },
      {
        default:
          "checkmo, banktransfer, cashondelivery, purchaseorder, free, braintree, paypal_express",
        label:
          "Payment method codes your store offers, comma-separated (used by 'allow only' rules and the Admin)",
        name: "paymentMethods",
        type: "text",
      },
      {
        default:
          "flatrate_flatrate, freeshipping_freeshipping, tablerate_bestway, ups_GND, usps_1, fedex_FEDEX_GROUND, dhl_P",
        label:
          "Shipping methods your store offers as carrier_method, comma-separated (used by 'allow only' rules and the Admin)",
        name: "shippingMethods",
        type: "text",
      },
      {
        default: "UTC",
        label:
          "Time zone for day and time conditions (IANA name, for example Europe/London)",
        name: "timezone",
        type: "text",
      },
    ],
  },

  installation: {
    customInstallationSteps: [
      {
        description:
          "Provision App Builder Database Storage and create the collection for restriction rules.",
        name: "Set up database",
        script: "./scripts/setup-database.js",
      },
    ],
    messages: {
      postInstallation:
        "Method Restrictions is installed. Add the Commerce webhook signing key to the app (see docs/installation.md), then open Method Restrictions in the Commerce Admin to add your first rule. New rules are off until you switch them on.",
      preInstallation:
        "Method Restrictions stores rules in App Builder Database Storage and checks Commerce webhook signatures. Make sure App Builder Data Services is added to your workspace and webhook signing is switched on in Commerce.",
    },
  },

  metadata: {
    description:
      "Hide, or allow only, payment and shipping methods at checkout by customer group, cart totals, weight, address, products, categories, store view, day and time, and coupon code.",
    displayName: "Payment & Shipping Method Restrictions",
    id: "method-restrictions",
    version: "0.1.0",
  },

  webhooks: [
    {
      category: "modification",
      description:
        "Hides payment methods that restriction rules exclude (Adobe Commerce on cloud infrastructure and on-premises).",
      env: ["paas"],
      label: "Payment method restrictions (PaaS)",
      requireAdobeAuth: false,
      runtimeAction: "method-restrictions/filter-payment",
      webhook: {
        ...paymentWebhook,
        webhook_method:
          "plugin.magento.out_of_process_payment_methods.api.payment_method_filter.get_list",
      },
    },
    {
      category: "modification",
      description:
        "Hides payment methods that restriction rules exclude (Adobe Commerce as a Cloud Service).",
      env: ["saas"],
      label: "Payment method restrictions (SaaS)",
      requireAdobeAuth: false,
      runtimeAction: "method-restrictions/filter-payment",
      webhook: {
        ...paymentWebhook,
        webhook_method:
          "plugin.out_of_process_payment_methods.api.payment_method_filter.get_list",
      },
    },
    {
      category: "modification",
      description:
        "Removes shipping methods that restriction rules exclude (Adobe Commerce on cloud infrastructure and on-premises).",
      env: ["paas"],
      label: "Shipping method restrictions (PaaS)",
      requireAdobeAuth: false,
      runtimeAction: "method-restrictions/filter-shipping",
      webhook: {
        ...shippingWebhook,
        webhook_method:
          "plugin.magento.out_of_process_shipping_methods.api.shipping_rate_repository.get_rates",
      },
    },
    {
      category: "modification",
      description:
        "Removes shipping methods that restriction rules exclude (Adobe Commerce as a Cloud Service).",
      env: ["saas"],
      label: "Shipping method restrictions (SaaS)",
      requireAdobeAuth: false,
      runtimeAction: "method-restrictions/filter-shipping",
      webhook: {
        ...shippingWebhook,
        webhook_method:
          "plugin.out_of_process_shipping_methods.api.shipping_rate_repository.get_rates",
      },
    },
  ],
});
