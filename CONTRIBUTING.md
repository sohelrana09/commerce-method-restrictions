# Contributing to Method Restrictions

Bug fixes, new conditions, Admin improvements and better documentation are all welcome. For larger changes, open an issue first so we can agree on the approach.

## Getting set up

Follow the [Quick start](README.md#quick-start): you need Node.js 24. The unit tests need no Adobe account, because the database, Commerce, webhook signatures and I/O Runtime are faked:

```bash
git clone https://github.com/sohelrana09/commerce-method-restrictions.git
cd commerce-method-restrictions
npm install
npm test
```

`npm run admin:preview` runs the Admin page at http://localhost:4360/preview.html with rules kept in the browser. To deploy your copy, follow [docs/installation.md](docs/installation.md): you need an App Builder project, and a Commerce instance in the same Adobe organization to install it on.

## Making a change

1. Fork the repository and create a branch: `git checkout -b feature/your-change`.
2. Follow the [project structure](README.md#project-structure):
   - the rules engine is `src/common/engine`: dependency-free modules, with unit tests, that the webhooks and the Admin page both import (the Admin as `#engine`). Keep them free of DOM and Node APIs;
   - server-only logic goes in `src/common/restrictions`; actions stay thin: check the request, call `src/common`, answer;
   - checkout must never break: after the signature check, every failure in a webhook answers "no change", and the engine never hides every method;
   - the signature check stays first in both webhook actions, before any rule, setting or database is read.
3. Keep secrets on the server: never log credentials, tokens, webhook payloads or shopper data, and never commit `.env` or `.aio`.
4. Run the checks:

   ```bash
   npm run code:check
   npm run typecheck
   npm test
   ```

   Plus `npm run admin:preview` for anything on the Admin page.

5. Update the README, the guides in `docs/` and the [CHANGELOG](CHANGELOG.md) when behaviour, rule fields or setup change.
6. Commit, push the branch and open a pull request that says what changed and how you tested it. If you tried it on a Commerce instance, say which (SaaS or PaaS, and the version).

## Adding a condition field

1. Add it to `FIELDS` in `src/common/engine/index.js` and read it in `reader()`.
2. Fill it in both payload readers in `src/common/engine/context.js` (`fromPaymentPayload` and `fromShippingPayload`), and in `sampleToContext` for **Test a cart**.
3. Add it to the type declarations in `src/common/engine/index.d.ts`, and to `FIELD_LABELS` and `FIELD_ORDER` in the Admin (`src/commerce-backend-ui-2/web-src/src/lib/rules.ts`).
4. Document it in [docs/rules.md](docs/rules.md), including which webhook sends it.

## Reporting bugs and security issues

- Bugs and ideas: [open an issue](https://github.com/sohelrana09/commerce-method-restrictions/issues/new/choose).
- Security problems: report them privately, see [SECURITY.md](SECURITY.md).

By contributing you agree to follow the [code of conduct](CODE_OF_CONDUCT.md), and that your contribution is licensed under the [MIT License](LICENSE).
