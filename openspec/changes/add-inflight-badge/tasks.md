## 1. Implementation
- [ ] 1.1 Add a helper to compute total in-flight orders across sites using existing stored order state (`isDelivered === false`).
- [ ] 1.2 Add a background helper that formats and applies the action badge (`''`, `1..99`, `99+`) via `browser.action.setBadgeText`, with a fixed badge background color.
- [ ] 1.3 Update the badge on background startup/installation by reading storage and applying the computed total.
- [ ] 1.4 Update the badge after successful scrapes (after order state is saved) so the badge reflects the latest stored state.
- [ ] 1.5 Add tests covering:
  - count=0 clears badge
  - count=5 shows `5`
  - count=120 shows `99+`
  - scrape-in-progress state changes do not affect badge semantics

## 2. Validation
- [ ] 2.1 Run `pnpm test run`.
- [ ] 2.2 Run `openspec validate add-inflight-badge --strict --no-interactive`.
