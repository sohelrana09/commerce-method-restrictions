/**
 * Commerce webhook signatures.
 *
 * With signing switched on (Stores > Settings > Configuration > Adobe Services > Webhooks),
 * Commerce signs each request body with its private key and sends the base64 signature in the
 * `x-adobe-commerce-webhook-signature` header. The actions run with `raw-http: true`, so the body
 * arrives untouched in `__ow_body` (base64-encoded by the platform for JSON requests), and they
 * check it against the public key from the same Admin page, stored as
 * COMMERCE_WEBHOOKS_PUBLIC_KEY.
 */

import { createPublicKey, createVerify } from "node:crypto";

export const SIGNATURE_HEADER = "x-adobe-commerce-webhook-signature";

export class SignatureError extends Error {
  // biome-ignore lint/style/useConsistentMemberAccessibility: plain JavaScript has no access modifiers
  constructor(message, options) {
    super(message, options);
    this.name = "SignatureError";
  }
}

/** Accepts a PEM with real line breaks, escaped "\n" sequences, or the bare base64 key body. */
export function toPem(key) {
  const value = String(key ?? "")
    .replace(/\\n/gu, "\n")
    .trim();
  if (!value) {
    return "";
  }
  if (value.includes("-----BEGIN")) {
    return value;
  }
  const body = value
    .replace(/\s+/gu, "")
    .match(/.{1,64}/gu)
    ?.join("\n");
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/u;

/**
 * The raw request body as bytes. App Builder base64-encodes `__ow_body` for JSON requests; a
 * body that isn't valid base64 is used as-is.
 */
export function rawBody(params) {
  const body = params.__ow_body;
  if (typeof body !== "string") {
    return null;
  }
  const compact = body.trim();
  if (compact && compact.length % 4 === 0 && BASE64.test(compact)) {
    return Buffer.from(compact, "base64");
  }
  return Buffer.from(body, "utf8");
}

function header(params, name) {
  const headers = params.__ow_headers ?? {};
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? headers[key] : undefined;
}

function verifies(publicKey, data, signature) {
  const verifier = createVerify("SHA256");
  verifier.update(data);
  verifier.end();
  return verifier.verify(publicKey, signature, "base64");
}

/**
 * Verifies the request and returns its parsed JSON body. Throws SignatureError when the key is
 * missing, the header is missing, or the signature doesn't match.
 */
export function verifyWebhook(params) {
  const pem = toPem(params.COMMERCE_WEBHOOKS_PUBLIC_KEY);
  if (!pem) {
    throw new SignatureError("COMMERCE_WEBHOOKS_PUBLIC_KEY is not set");
  }
  const signature = header(params, SIGNATURE_HEADER);
  if (!signature) {
    throw new SignatureError(`Missing ${SIGNATURE_HEADER} header`);
  }
  const body = rawBody(params);
  if (!body) {
    throw new SignatureError("Missing request body");
  }

  let publicKey;
  try {
    publicKey = createPublicKey(pem);
  } catch (error) {
    throw new SignatureError("COMMERCE_WEBHOOKS_PUBLIC_KEY isn't a valid key", {
      cause: error,
    });
  }
  // Commerce signs the body it sends. Adobe's App Builder sample verifies the platform's base64
  // form of it instead, so both are accepted: each still needs Commerce's private key.
  const valid =
    verifies(publicKey, body, signature) ||
    verifies(publicKey, String(params.__ow_body), signature);
  if (!valid) {
    throw new SignatureError("Invalid webhook signature");
  }

  try {
    return JSON.parse(body.toString("utf8"));
  } catch (error) {
    throw new SignatureError("The signed body isn't JSON", {
      cause: error,
    });
  }
}
