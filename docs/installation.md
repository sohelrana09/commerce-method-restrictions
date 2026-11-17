# Installation

Method Restrictions is an App Builder app. You deploy it to an App Builder workspace, give it Commerce's webhook signing key, and install it on a Commerce instance through App Management, which sets up the Admin menu, the settings, the two checkout webhooks and the database.

## Requirements

- **Commerce:** Adobe Commerce as a Cloud Service, or Adobe Commerce 2.4.5+ on cloud infrastructure or on-premises with the Adobe Commerce webhooks module and out-of-process payment and shipping support (the checkout starter kit's prerequisites).
- **Storefront:** for payment restrictions, a headless storefront (Edge Delivery Services, PWA or custom). Adobe documents the payment-method filter for headless checkouts only. Shipping restrictions apply wherever Commerce asks for shipping rates.
- **App Builder:** a project in the **same Adobe organization** as the Commerce instance. App Management only lists apps from the instance's own organization.
- **Tools:** Node.js 24 (`.nvmrc`) and the Adobe I/O CLI: `npm install -g @adobe/aio-cli`.

## App Builder project

In the [Adobe Developer Console](https://developer.adobe.com/console), create a project from the **App Builder** template. In each workspace you deploy to (for example Stage and Production), add:

| Service | Why |
|---|---|
| I/O Management API | App Management, which registers the webhooks. |
| App Builder Data Services | App Builder Database Storage for the rules and the product cache. |
| OAuth Server-to-Server credential | Commerce REST (store views, customer groups, product lookups) and database access. |

`install.yaml` lists the same APIs for the Adobe Commerce Marketplace.

## Webhook signing key

The webhook actions are public URLs, as Commerce webhooks need, so the app only answers requests Commerce has signed.

1. In the Commerce Admin, open **Stores → Settings → Configuration → Adobe Services → Webhooks**.
2. Under **Digital Signature Configuration**, set **Enabled** to **Yes** and choose **Regenerate key pair**.
3. Copy the **public key** (the whole `-----BEGIN PUBLIC KEY----- … -----END PUBLIC KEY-----` block).
4. Put it in `.env` as `COMMERCE_WEBHOOKS_PUBLIC_KEY`. On one line, write the line breaks as `\n`; a bare base64 key body works too.

If you regenerate the key pair in Commerce, update `.env` and redeploy, or every webhook call is rejected (and, by design, nothing is restricted until you do).

## Deploy

```bash
git clone https://github.com/sohelrana09/commerce-method-restrictions.git
cd commerce-method-restrictions
npm install

aio login
aio console org select
aio console project select
aio console workspace select
aio app use --merge
cp env.dist .env      # then set COMMERCE_WEBHOOKS_PUBLIC_KEY

aio app deploy
```

`aio app use --merge` writes the workspace's credentials into `.env` and `.aio`. Both are git-ignored: never commit them.

To deploy from GitHub instead, set the workspace secrets the template workflows expect (`CLIENTID_STAGE`, `CLIENTSECRET_STAGE`, `TECHNICALACCID_STAGE`, `TECHNICALACCEMAIL_STAGE`, `IMSORGID_STAGE`, `SCOPES_STAGE`, `AIO_RUNTIME_NAMESPACE_STAGE`, `AIO_RUNTIME_AUTH_STAGE`, and the same with `_PROD`), plus the public key as the workspace's `COMMERCE_WEBHOOKS_PUBLIC_KEY`. Then run **Deploy to Stage** or **Deploy to Production** from the Actions tab.

## Install in Commerce

1. In the Commerce Admin, open **Apps → App Management**.
2. Find **Payment & Shipping Method Restrictions** and choose **Install**.
3. App Management:
   - adds **Method Restrictions** to the Admin menu, protected by an ACL resource;
   - subscribes the two webhooks, with the SaaS or PaaS method names to match the instance (see [webhooks.md](webhooks.md));
   - runs the **Set up database** step (`scripts/setup-database.js`), which provisions the workspace's App Builder database if needed and creates the `restriction_rules` and `restriction_catalog` indexes.
4. Grant the Method Restrictions ACL resource to the admin roles that manage checkout.
5. Under **Configure**, check the payment and shipping method lists and the time zone (see [Settings](#settings)).
6. Open **Method Restrictions**, start from an example, try it with **Test a cart**, and switch it on. The bundled examples are templates, and every one is switched off.

## Settings

In **App Management → Method Restrictions → Configure**:

| Setting | Default | Meaning |
|---|---|---|
| Apply payment and shipping method restrictions | On | The master switch. When it's off, both webhooks answer "no change". |
| Payment method codes | `checkmo, banktransfer, cashondelivery, purchaseorder, free, braintree, paypal_express` | The payment methods your store offers. "Allow only" rules hide the codes on this list they don't name; the Admin offers them in pickers; and the app never hides all of them. |
| Shipping methods | `flatrate_flatrate, freeshipping_freeshipping, tablerate_bestway, ups_GND, usps_1, fedex_FEDEX_GROUND, dhl_P` | The same for shipping, as `carrier_method` codes. |
| Time zone | `UTC` | The IANA time zone for rule dates and for day and time conditions. An unknown name falls back to UTC. |

Find your codes in the Commerce Admin (**Stores → Configuration → Sales → Payment Methods** and **Delivery Methods**), or in the `code` of a payment method and the `carrier_code` and `method_code` of a shipping rate in your storefront's GraphQL responses. A shipping method's code is `carrier_code` + `_` + `method_code`, for example `ups_GND`.

## Data

| Collection | Holds | Kept for |
|---|---|---|
| `restriction_rules` | Rules from the Admin page | Until deleted, or until the app is uninstalled |
| `restriction_catalog` | Categories and attributes of products looked up for category and attribute conditions | An hour per product, refreshed on use; dropped on uninstall |

No shopper data is stored. Webhook payloads are read in memory and never logged.

## Uninstalling

Uninstall in **Apps → App Management**. It removes the menu and the webhooks, and **drops both collections**. Copy the rules you want to keep first (each rule's JSON is what the [rules reference](rules.md) describes). Shoppers see every method again.

## Troubleshooting

| Symptom | Check |
|---|---|
| A method that should be hidden still shows | The rule is switched on, the master switch is on, today is inside its dates, and **Test a cart** with the same customer, address and items hides it. Then check `aio app logs` for the webhook action. |
| Logs say "Rejected payment webhook: Invalid webhook signature" | `COMMERCE_WEBHOOKS_PUBLIC_KEY` doesn't match the key pair in Commerce. Copy the public key again and redeploy. |
| Logs say "COMMERCE_WEBHOOKS_PUBLIC_KEY is not set" | Add it to `.env` and redeploy. |
| Logs say "Hiding no payment methods: Rule … is invalid" | A rule saved through the API doesn't validate. Open it in the Admin, which lists the problems, and fix or switch it off. |
| Logs say "would hide every method; hiding none instead" | The rules leave no method on the store's list. Expected safety behaviour; loosen a rule. |
| Category or attribute conditions never match | Product lookups need the OAuth credential's access to Commerce REST; look for "Product lookup failed" in the logs. Attribute codes must be the attribute's code, for example `hazmat`. |
| "Allow only" does nothing | The method list in the settings is empty for that type. |
| A change takes a while to show | Rules are cached for 30 seconds in each warm action container. |
| "Not associated with a Commerce instance" in logs | The app is deployed but not installed in App Management yet. |
