import { describe, expect, test } from "vitest";

import {
  rawBody,
  SignatureError,
  toPem,
  verifyWebhook,
} from "../../src/common/signature.js";
import { keys, sign, signedParams } from "../fixtures/signing.js";

const body = { payload: { cart: { id: 1 } } };
const PEM_ARMOUR = /-----[A-Z ]+-----/gu;
const SPACES = /\s+/gu;
const PEM_START = /^-----BEGIN PUBLIC KEY-----\n/u;
const LINE_BREAKS = /\n/gu;

describe("verifyWebhook", () => {
  test("accepts a body signed by Commerce and returns it parsed", () => {
    expect(verifyWebhook(signedParams(body))).toEqual(body);
  });

  test("accepts a signature over the base64 body, as in Adobe's sample", () => {
    const params = signedParams(body);
    params.__ow_headers = {
      "X-Adobe-Commerce-Webhook-Signature": sign(params.__ow_body),
    };
    expect(verifyWebhook(params)).toEqual(body);
  });

  test("accepts a plain-text body and a key with escaped line breaks", () => {
    const text = JSON.stringify(body);
    expect(
      verifyWebhook({
        __ow_body: text,
        __ow_headers: { "x-adobe-commerce-webhook-signature": sign(text) },
        COMMERCE_WEBHOOKS_PUBLIC_KEY: keys.publicKey.replace(
          LINE_BREAKS,
          "\\n",
        ),
      }),
    ).toEqual(body);
  });

  test.each([
    ["no key", { COMMERCE_WEBHOOKS_PUBLIC_KEY: "" }, "not set"],
    [
      "no header",
      { __ow_headers: {} },
      "Missing x-adobe-commerce-webhook-signature",
    ],
    ["no body", { __ow_body: undefined }, "Missing request body"],
    [
      "a broken key",
      { COMMERCE_WEBHOOKS_PUBLIC_KEY: "not-a-key" },
      "isn't a valid key",
    ],
    [
      "a wrong signature",
      { __ow_headers: { "x-adobe-commerce-webhook-signature": sign("other") } },
      "Invalid webhook signature",
    ],
  ])("rejects a request with %s", (_name, overrides, message) => {
    const call = () => verifyWebhook(signedParams(body, overrides));
    expect(call).toThrow(SignatureError);
    expect(call).toThrow(message);
  });

  test("rejects a signed body that isn't JSON", () => {
    const text = "not json";
    expect(() =>
      verifyWebhook({
        __ow_body: text,
        __ow_headers: { "x-adobe-commerce-webhook-signature": sign(text) },
        COMMERCE_WEBHOOKS_PUBLIC_KEY: keys.publicKey,
      }),
    ).toThrow("isn't JSON");
  });

  test("a tampered body fails", () => {
    const params = signedParams(body);
    params.__ow_body = Buffer.from(JSON.stringify({ payload: {} })).toString(
      "base64",
    );
    expect(() => verifyWebhook(params)).toThrow("Invalid webhook signature");
  });
});

describe("helpers", () => {
  test("toPem wraps a bare key body", () => {
    const bare = keys.publicKey.replace(PEM_ARMOUR, "").replace(SPACES, "");
    expect(toPem(bare)).toMatch(PEM_START);
    expect(toPem(undefined)).toBe("");
  });

  test("rawBody decodes base64 and keeps other text", () => {
    expect(
      rawBody({ __ow_body: Buffer.from("{}").toString("base64") }).toString(),
    ).toBe("{}");
    expect(rawBody({ __ow_body: "{}" }).toString()).toBe("{}");
    expect(rawBody({})).toBeNull();
  });
});
