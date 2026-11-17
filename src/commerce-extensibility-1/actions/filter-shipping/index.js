// Shipping-rates webhook: removes the shipping methods restriction rules exclude.
import { createWebhookAction } from "../webhook.js";

export const main = createWebhookAction("shipping");
