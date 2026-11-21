# zero-shopify — Shopper Reply Drafter

## Launch review

| | |
|---|---|
| **Live merchant inbox** | https://shopify-inbox-ai-drafter-vercel.vercel.app/ (AI replies show only while the `inbox-ai-reply-drafter` flag is on) |
| **Ship-or-stop memo** | [launch_memo.md](launch_memo.md) |
| **Decision** | **STOP** |
| Unedited send rate (≥ 60%) | Not measurable: 0 `ai_draft_sent_unchanged` / 0 `ai_draft_created` in PostHog when the memo was written (2026-11-22). No genuine merchant usage yet; our own test drafts since then (local runs and the Q-123 screenshot) do not count. |
| Invented ingredients (= 0) | 0: promptfoo 0 of 120 checks failed, PostHog 0 of 240 events failed |
| Honest-unknown answers (100%) | 43/43 exact in promptfoo and in PostHog (on `data/questions.csv`; the 36-question CSV isn't in the repo) |

### A question the product page can't answer

Q-123 on the live inbox: Ifeoma asks whether the Whipped Shea Body Butter (DSP-022) is nut-free for her son's peanut allergy. The page makes no nut-free claim, so the draft is the approved hand-off, exactly, with no greeting and no nut-free claim.

![Live merchant inbox: Q-123 gets the exact approved hand-off](docs/q-123-unanswerable-reply.webp)

### Key Claude Code prompt (excerpt)

> Use genuine merchant usage, not automated replays or simulated sends. If the required events are missing, mark this bar NOT MEASURABLE.
>
> Do not generate artificial send events or click Send to manufacture a passing metric.

### Drafter prompt it produced (excerpt from `lib/prompt.ts`)

```text
2. Ingredient is NOT listed -> NEVER write "no", "there is no", "doesn't contain", "none of the ingredients are",
   "free of" or "X-free". A missing name is not a free-of claim, and a shopper with an allergy may rely on your words.
4. Facility warnings ("Made in a facility that also handles tree nuts and peanuts") -> never call the product nut-free.

# Fallback
If ANY part of the question cannot be fully answered from the page, the whole reply must be exactly this sentence,
with no greeting, no name, no partial answer and no other words, and status must be "escalated":
"Thanks for asking. I don't want to guess on this, so I'll check with the shop and get back to you."
```

**What I changed and checked:** I replaced the old hand-off with the exact approved sentence and added a server-side rule that swaps any draft the page can't fully answer for it. I then checked it in promptfoo (43/43 exact, 0 invented ingredients in 120), in a PostHog replay (43/43, 0 invented ingredients), and on the live inbox with Q-123 (screenshot above).

---

Drafts replies to Shopify Inbox shopper questions using **only** the product page the shopper is asking about.
If the page doesn't answer it, the reply hands off to the merchant:

> Thanks for asking. I don't want to guess on this, so I'll check with the shop and get back to you.

That sentence is sent exactly as written, with no greeting or extra words. Any question the page can't fully answer gets it.

Built with Next.js, the Vercel AI SDK, and OpenRouter.

## Setup
1. `npm install`
2. Put your key in `.env.local` (gitignored, never committed):
   ```
   OPENROUTER_API_KEY=sk-or-...
   # optional: OPENROUTER_MODEL=baidu/ernie-5.5-flash-preview:free
   ```
3. `npm run dev` → http://localhost:3000. Pick a sample question or type your own.

Run every sample question: `npm run eval` writes `out/drafts.csv`. Run a few: `npm run eval -- Q-001 Q-006`.

## Reply rules (see `lib/prompt.ts`)
| Situation | Reply |
|---|---|
| Ingredient listed under its INCI name (e.g. Prunus Amygdalus Dulcis Oil) | Yes, and name it as sweet almond oil |
| Ingredient **not** listed | Never "no" or "free of". Says it isn't on the list, then hands off to the merchant |
| Facility warning ("handles tree nuts and peanuts") | Quotes the warning and never calls the product nut-free |
| Blank allergen statement | Makes no allergen claim, and the merchant answers the safety question |
| Parfum / fragrance components (linalool, essential oils) | Can't confirm, so it goes to the merchant |
| Shipping, stock, returns, certifications, pregnancy/baby safety | Goes to the merchant |
| Question is about a different product than the page | Goes to the merchant |

Code guardrails in `lib/drafter.ts` also turn a reply into the fallback if it quotes evidence that isn't on the page,
or makes a "free of" / "doesn't contain" / "is safe" claim the page doesn't make.

## Data note
Many sample questions name a different product than their `product_id` page (Q-002 asks about a body butter
from the Rose Lip Balm page). Many `expected_answer_note` values also don't match the catalog (Q-001 says DSP-003 contains almond,
but it doesn't). The drafter trusts the page, not the note.
