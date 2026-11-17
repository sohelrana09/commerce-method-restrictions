/**
 * Product data for category and attribute conditions, ported from Extra Fees.
 *
 * Webhook payloads don't always carry each item's categories and attributes, so they are looked
 * up through the Commerce REST API and cached in App Builder Database Storage for `ttlMs`. A
 * failed lookup returns what is cached (or nothing): a product without data simply doesn't match
 * a category or attribute condition.
 */

import { CATALOG, withDb } from "./db.js";

export const DEFAULT_CATALOG_TTL_MS = 60 * 60 * 1000;
const MAX_SKUS_PER_REQUEST = 50;

/** Turns a REST product into { attributes, categoryIds }. */
export function toCatalogEntry(product) {
  const attributes = {};
  for (const attr of product?.custom_attributes ?? []) {
    if (attr?.attribute_code) {
      attributes[attr.attribute_code] = attr.value;
    }
  }
  for (const key of ["type_id", "attribute_set_id", "weight", "visibility"]) {
    if (product?.[key] !== undefined && attributes[key] === undefined) {
      attributes[key] = product[key];
    }
  }
  const categoryIds = (product?.extension_attributes?.category_links ?? [])
    .map((link) => String(link.category_id))
    .filter(Boolean);
  const fromAttribute = attributes.category_ids;
  if (!categoryIds.length && Array.isArray(fromAttribute)) {
    categoryIds.push(...fromAttribute.map(String));
  }
  return { attributes, categoryIds };
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size));
  }
  return out;
}

/** Fetches products by SKU from Commerce REST (`GET /V1/products`). */
export async function fetchProducts(commerce, skus) {
  const results = [];
  for (const batch of chunk(skus, MAX_SKUS_PER_REQUEST)) {
    const searchParams = {
      "searchCriteria[filter_groups][0][filters][0][condition_type]": "in",
      "searchCriteria[filter_groups][0][filters][0][field]": "sku",
      "searchCriteria[filter_groups][0][filters][0][value]": batch.join(","),
      "searchCriteria[pageSize]": String(batch.length),
    };
    // biome-ignore lint/performance/noAwaitInLoops: batches are sequential to stay within Commerce rate limits
    const body = await commerce.get("products", { searchParams }).json();
    results.push(...(body?.items ?? []));
  }
  return results;
}

/**
 * Returns { [sku]: { attributes, categoryIds } } for the SKUs, from the cache where fresh and
 * from Commerce for the rest.
 */
export async function loadCatalogEntries(skus, params, deps) {
  const {
    connect,
    getCommerce,
    ttlMs = DEFAULT_CATALOG_TTL_MS,
    now = Date.now(),
    logger = console,
  } = deps;
  const unique = [...new Set(skus.filter(Boolean))];
  if (!unique.length) {
    return {};
  }

  return await withDb(
    params,
    async (client) => {
      const collection = client.collection(CATALOG);
      const cached = await collection
        .find({ expiresAt: { $gt: now }, sku: { $in: unique } })
        .toArray();
      const catalog = Object.fromEntries(
        cached.map((doc) => [
          doc.sku,
          {
            attributes: doc.attributes ?? {},
            categoryIds: doc.categoryIds ?? [],
          },
        ]),
      );

      const missing = unique.filter((sku) => !catalog[sku]);
      if (!missing.length) {
        return catalog;
      }

      try {
        const commerce = await getCommerce(params);
        const products = await fetchProducts(commerce, missing);
        for (const product of products) {
          const entry = toCatalogEntry(product);
          catalog[product.sku] = entry;
          // biome-ignore lint/performance/noAwaitInLoops: one upsert per product; batches are small
          await collection.replaceOne(
            { sku: product.sku },
            { ...entry, expiresAt: now + ttlMs, sku: product.sku },
            { upsert: true },
          );
        }
      } catch (error) {
        logger.warn(
          `Product lookup failed for ${missing.length} SKU(s): ${error.message}`,
        );
      }
      return catalog;
    },
    connect,
  );
}
