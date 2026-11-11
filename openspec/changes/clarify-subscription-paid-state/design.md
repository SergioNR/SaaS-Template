# Design

## Context

The subscription row has `expires_at`, `stripe_subscription_id` (null = trial), `stripe_status`, `stripe_synced_at`. `isStoredSubscriptionActive(row)` = Stripe-backed and `expires_at` in the future; the checkout guard and the webhook already use it. The SPA computes `paid|trial|active|inactive` from `is_paid` + `expires_at`, with `active` meaning "admin payload, unknown kind".

## Decisions

### Redefine `is_paid` and add `status`, or only add `status`?
Options:
1. **Add `status` and redefine `is_paid = status === 'paid'` (recommended).** One meaning everywhere; the name finally says what it is. The only consumer (the SPA) already treats `is_paid` with a past expiry as inactive, so its rendering does not change.
2. Add `status`, keep `is_paid` as "ever paid". No breaking change, but keeps a misleading field alive and forces admins/forks to learn two notions.
3. Replace `is_paid` with `status` entirely. Cleanest payload, but a hard break for every fork's client.

### Status vocabulary
`paid | trial | inactive` - identical to the SPA's existing values minus its `active` fallback (which disappears once admin payloads carry `status`). `past_due` maps to `paid` because it still grants access (consistent with `ACCESS_GRANTING_STATUSES`).

### Stats
`activeSubscriptions` = paid + unexpired (`stripe_subscription_id not null AND expires_at > now`) - the AGENTS definition. `activeTrials` = trial + unexpired. `totalSubscriptions` unchanged (all rows).

### Computing status in the model, not the controller
Status depends on `stripe_subscription_id`, which must never leave the model; computing it there keeps the id inside the repository layer and lets every payload share the helper.

## Risks / Trade-offs

- [A fork's client reads `is_paid` as "ever paid"] → called out as BREAKING in the proposal and commit (`feat(billing)!`).
- [Clock skew between `status` computed server-side and the SPA's own date logic] → the SPA prefers the server `status` once present.

## Open questions for the implementer

- Add `trial_ended` vs `ended` (expired trial vs churned paid) for admins? Recommended: not now; if wanted, it needs only `stripe_subscription_id` presence on an expired row and can be a fourth value later.
- Should the billing page's checkout offer key off `status !== 'paid'` instead of `is_paid`? Recommended: yes (same result, clearer).

## Implementation decisions (resolved open questions)

- Option 1: `status` added and `is_paid` redefined as `status === 'paid'` (breaking, `feat(billing)!`).
- No `trial_ended` / `ended` split for now.
- The billing page's plan offer keys off the context flags derived from `status` (equivalent to `status !== 'paid'`).
- Shape built in one pure helper, `toPublicSubscription` in `config/stripeSubscriptionStatuses.js`, next to `isStoredSubscriptionActive`; models select `stripe_subscription_id` only to feed it.
