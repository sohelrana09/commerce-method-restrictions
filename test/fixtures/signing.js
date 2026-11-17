/** A throwaway RSA key pair and a signed raw-http request, as Commerce would send it. */
import { createSign, generateKeyPairSync } from "node:crypto";

export const keys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});

export function sign(text, privateKey = keys.privateKey) {
  const signer = createSign("SHA256");
  signer.update(text);
  signer.end();
  return signer.sign(privateKey, "base64");
}

/** Raw-http params: the body base64-encoded, the signature over the JSON text. */
export function signedParams(body, overrides = {}) {
  const text = JSON.stringify(body);
  return {
    __ow_body: Buffer.from(text).toString("base64"),
    __ow_headers: { "x-adobe-commerce-webhook-signature": sign(text) },
    COMMERCE_WEBHOOKS_PUBLIC_KEY: keys.publicKey,
    ...overrides,
  };
}
