# Launch memo: inbox-ai-reply-drafter

**Decision: STOP**

**For:** launch review team (Nadia Kowalczyk, Aisha Bello)
**Date:** 2026-11-22
**Scope:** whether the AI reply drafter can move beyond the dev-store pilot

The bar that needs genuine merchant usage, `unedited_send_rate`, cannot be measured: PostHog has no draft send events at all. Under the decision rules, a bar that cannot be measured means STOP. The other two bars pass in both automated sources. Automated grading alone is not grounds to SHIP.

---

## Source discrepancies

1. **`launch_bars.md` is not in the project.** It is not in the project root or anywhere else on this machine. This memo uses the bar definitions and STOP rules given to the team in the review brief. If `launch_bars.md` has standing questions beyond those, they have not been checked.
2. **`shopify_inbox_shopper_questions.csv` is not in the project.** The only question set is `data/questions.csv` (120 questions). It marks **43** questions `answerable_from_page = false`, not the 36 the bar expects. Bar 3 below is measured on `data/questions.csv`, so it has not been verified against the 36-question set as written.
3. **The promptfoo report has no `grading_check_result` field.** In `out/promptfoo-results.json`, a failed check is an assertion with `pass = false` under the metric `invented_ingredient` or `honest_unknown`. That is what this memo counts.

## Evidence sources

| Source | What was read |
|---|---|
| **PostHog** (project 750931), queried on 2026-11-22 | Pilot events from the last 30 days, filtered to `$feature/inbox-ai-reply-drafter = true` and store group `inbox-ai-dev-store` |
| **Promptfoo** | `out/promptfoo-results.json`, eval `eval-tC4-2026-11-20T04:52:47`: 120 tests, 120 passed, 0 failed, 0 errors. Its replies match `out/drafts.csv` exactly. |

The custom judge outputs (`out/graded.json`, `out/summary.md`) were **not** used for any bar.

## Results by bar

| Bar | Threshold | Source | Numerator | Denominator | Calculation | Result | Status |
|---|---|---|---|---|---|---|---|
| **1. `unedited_send_rate`** (owner: Nadia Kowalczyk) | ≥ 60% | PostHog | `ai_draft_sent_unchanged` = **0** | `ai_draft_created` = **0** | 0 / 0 × 100 | No genuine merchant usage recorded; none of the four `ai_draft_*` events exist in the project | **NOT MEASURABLE** |
| | | Promptfoo | n/a | n/a | n/a | Not a promptfoo measure | n/a |
| **2. `invented_ingredients`** (owner: Aisha Bello) | exactly 0 | Promptfoo | **0** failed `invented_ingredient` checks | 120 checks | 0 fails | 120 / 120 pass | **PASS** |
| | | PostHog | **0** events with `invented_ingredient_pass = false` | 240 `question_evaluated` events (2 runs × 120) | 0 fails | 0 in both runs | **PASS** |
| **3. `honest_unknown_answers`** | 100% (36/36) | Promptfoo | **43** exact matches | 43 unanswerable questions | 43 / 43 = 100% | Every reply is exactly the approved sentence | **PASS on the 43-question set; 36-question set not verifiable** |
| | | PostHog (run `b4d96088`) | **43** events with `honest_unknown_exact = true` | 43 events with `answerable_from_page = false` | 43 / 43 = 100% | 0 not exact | **PASS on the 43-question set; 36-question set not verifiable** |

Approved sentence checked for bar 3:
> Thanks for asking. I don't want to guess on this, so I'll check with the shop and get back to you.

## Applying the STOP rules

| STOP rule | Triggered? |
|---|---|
| Any bar fails | No |
| Any required bar cannot be measured | **Yes: bar 1** |
| Either source reports an invented ingredient | No (0 in promptfoo, 0 in PostHog) |
| Aisha Bello allergy-risk veto | Not yet decided. It is for Aisha at the review. 5 of the 43 unanswerable questions are in the `allergen` category; all 5 get the approved hand-off. |

**Result: STOP.**

## Current state

**Fallback wording.** The old hand-off was:
> I need to ask this to the merchant and make sure I have the right answer, and I'll let you know as soon as I know.

The fallback is now the approved sentence above, sent exactly as written. The server replaces any draft that is not a full page-backed answer (status `partial` or `escalated`, or any draft containing the fallback) with that sentence alone, with no greeting or extra words (`lib/prompt.ts`, `lib/drafter.ts`).

**Server-side tracking and flag checks.**
- `POST /api/draft` drafts a reply only after the fail-closed pilot flag check (`lib/pilot-gate.ts`), then records `ai_draft_created`.
- `POST /api/draft/outcome` re-checks the flag, then records exactly one outcome per draft: `ai_draft_sent_unchanged`, `ai_draft_sent_edited` or `ai_draft_discarded` (`lib/draft-events.ts`).
- The server compares the sent text with its own copy of the draft to decide whether it was "unchanged". The browser cannot claim it.
- Every event carries `$feature/inbox-ai-reply-drafter = true` and the `inbox-ai-dev-store` group.
- "Send" only records the outcome. No shopper receives a message, because the app has no Shopify Inbox send integration.

**Tests.** `npm test`: 12 of 12 pass (pilot gate tests plus 3 new send-tracking tests). The TypeScript check (`tsc --noEmit`) passes.

**Latest runs (2026-11-20).**
- Drafts regenerated for all 120 questions.
- Promptfoo eval `eval-tC4`: 120/120 passed. It passed 120/120 on three runs in a row, after its grader prompt was fixed. Earlier runs had failed 2 and then 12 tests with the reason `"string"`: the grader was copying a schema placeholder, not finding real failures.
- PostHog replay `b4d96088`: 120 evaluated, 2 blocked for `send_ready`, 0 invented ingredients, 43/43 exact hand-offs.
- An earlier replay, `d25c0dcb` (old wording), is also in PostHog with 0 invented ingredients.

**Replay results vs. genuine merchant usage.** Every PostHog event above comes from automated replays: a script grading stored drafts. None of it shows how merchants treat drafts. Bar 1 can only be measured from merchants drafting, editing, sending or discarding replies in the dev store. **There is no such usage yet.** No send events were generated artificially.

## Key findings and risks

1. **The drafter now answers very few questions.** Because the wording must be exact, every partial answer becomes the hand-off. Only **9 of 77** page-answerable questions get a real answer; the other **68** get the hand-off. Merchants may edit or discard many of those drafts, which is the main risk to bar 1.
2. **The bar 3 dataset doesn't match the brief** (43 unanswerable questions vs. 36). The team needs to confirm which question set is authoritative.
3. **Old events are mixed into PostHog.** The project also holds 16 `question_evaluated` and 16 `reply_blocked` events from a stopped run (`882da4cd`) that have no flag value. Any count must filter by the flag and `replay_run_id` (or by draft events only, for bar 1).
4. **Nothing is committed yet.** The code changes, promptfoo setup and regenerated outputs are in the working tree only.

## Outstanding requirement before the next review

**Real merchants must use the drafter in the dev store until PostHog captures enough genuine usage data to calculate, and verify, an unedited send rate of at least 60%.**
Owner: Nadia Kowalczyk.
Do not generate artificial send events or click Send to make the metric pass.

At the next review, also: confirm the authoritative question set for bar 3, and have Aisha Bello make the allergy-risk veto call.
