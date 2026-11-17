## What changed

<!-- What does this pull request do, and why? Link the issue if there is one: "Closes #..." -->

## How I tested it

<!-- Unit tests, Test a cart in the Admin preview, and if you deployed it: which workspace and Commerce instance (SaaS or PaaS, version), and which rules and carts you tried. -->

## Checklist

- [ ] `npm run code:check`, `npm run typecheck` and `npm test` pass
- [ ] New logic in the engine or `src/common/restrictions` has unit tests
- [ ] The signature check still runs first, and any failure after it leaves every method available
- [ ] No secrets, tokens, webhook payloads or shopper data in code, logs or tests
- [ ] README, `docs/` or CHANGELOG updated, if behaviour, rule fields or setup changed
