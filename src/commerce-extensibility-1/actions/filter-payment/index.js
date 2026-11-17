// Payment-method filter webhook: hides the payment methods restriction rules exclude.
import { createWebhookAction } from "../webhook.js";

export const main = createWebhookAction("payment");
