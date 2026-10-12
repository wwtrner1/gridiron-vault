# GridIronVault — UX copy audit

Scope: button labels and CTAs, error and validation text, onboarding and empty
states, form labels, placeholders and helper text. Code comments, variable
names, icon ids, internal logs and non-user-facing strings were excluded.

Method: every `.ts`/`.tsx` file under `src/` was scanned for user-facing string
literals, JSX text nodes and copy-bearing attributes (`placeholder`,
`aria-label`, tooltip `title`/`hint`, gate `reason`/`cta`, plan `blurb`/`perks`,
play `name`/`description`). 983 candidate strings were extracted; 47 of those
were icon ids in `Icon.tsx` and ~65 were duplicate or non-user-facing, leaving
**871 user-facing strings** in the audit.

---

## Issues

### 1
- **File:** src/lib/auth.tsx
- **Location:** `authMessage()` — default branch of the `AuthError` switch
- **Original:** `return error.message;`
- **Issue:** Surfaced the raw Identity library error string straight to a coach. Whatever GoTrue returned — including strings like `invalid_grant` — would render inside the sign-in form.
- **Category:** Clarity / Jargon
- **Suggested rewrite:** "Sign-in failed. Check your email and password, then try again." — **applied**

### 2
- **File:** src/lib/auth.tsx
- **Location:** `authMessage()` — final fallback return
- **Original:** `error instanceof Error ? error.message : "Something on our end failed. Try once more."`
- **Issue:** Same raw-error leak, and the fallback blamed an unnamed "our end" without telling the coach what to do. A network failure and a server failure read identically.
- **Category:** Specificity / Jargon
- **Suggested rewrite:** "We could not reach the sign-in service. Check your connection and try again." — **applied**

### 3
- **File:** src/pages/SignIn.tsx
- **Location:** Submit button, busy state
- **Original:** "Working…"
- **Issue:** Not action-oriented and not specific. The same label covered three different operations — signing in, creating an account, and sending a reset link — so it never confirmed which one was running.
- **Category:** Specificity / Action-oriented
- **Suggested rewrite:** "Signing you in…" / "Creating your account…" / "Sending the link…" — **applied**

### 4
- **File:** src/lib/plan.ts
- **Location:** `gateTool()` — `reason`
- **Original:** "This tool is part of the full drawing kit. Try it on any starter play, then unlock it for your own."
- **Issue:** Factually wrong, which is worse than unclear. Locked tools are locked everywhere, including on starter plays, so the copy promised something the product does not do.
- **Category:** Specificity / Clarity
- **Suggested rewrite:** "Freehand, polygon, zones, motion and auto-connect come with Head Coach. Lines, shapes and tokens stay free." — **applied**

### 5
- **File:** src/pages/Starters.tsx
- **Location:** Free-tier lock note
- **Original:** "The other 51 unlock on any paid plan — or stay free through beta by switching your plan back to Beta Coach."
- **Issue:** Pointed the reader at an internal plan switcher instead of a benefit, and framed the upgrade as a workaround. It also led with what the coach cannot have.
- **Category:** Negative framing / Clarity
- **Suggested rewrite:** "The other 51 — every formation, the run game and all five coverages — come with Head Coach." — **applied**

### 6
- **File:** src/pages/Builder.tsx
- **Location:** Export success toast
- **Original:** "Export ready in your downloads."
- **Issue:** Ambiguous about whether anything had actually happened. "Ready" reads as pending, and "your downloads" could mean the app or the browser.
- **Category:** Clarity / Specificity
- **Suggested rewrite:** "Export downloaded. Check your browser's downloads folder." — **applied**

### 7
- **File:** src/components/Inspector.tsx
- **Location:** Label chip input, `placeholder`
- **Original:** "Add a label, press Enter"
- **Issue:** Comma splice joining two instructions. Reads as a list of one item rather than a two-step action.
- **Category:** Clarity
- **Suggested rewrite:** "Add a label and press Enter" — **applied**

### 8 — low priority, not changed
- **File:** src/pages/NotFound.tsx
- **Location:** Pill above the heading
- **Original:** "Fourth and long"
- **Issue:** Borderline. It is on-voice for a coaching audience, but it is football jargon on an error page a confused user reaches, and it carries no information. Kept because the heading immediately below it ("That page is not in the book") does the explaining.
- **Category:** Jargon
- **Suggested rewrite:** None — leave as is, or "Page not found" if the page ever gets reached by non-coaches.

### 9 — low priority, not changed
- **File:** src/lib/plan.ts
- **Location:** `gateSave()` — `reason`
- **Original:** "Your Sideline Vault holds 8 plays and it is full. Delete one, or move up a plan to keep the whole install."
- **Issue:** Borderline. Two sentences where one would do, and "move up a plan" is slightly softer than it needs to be at the moment a save is blocked. It is specific and actionable, so it clears the bar.
- **Category:** Conciseness
- **Suggested rewrite:** None required. If tightened: "Your Sideline Vault is full at 8 plays. Delete one or upgrade to keep saving."

### 10 — retired file, left in the repo
- **File:** app.js
- **Location:** `updatePreview()` — pixel diagnostics under the play preview
- **Original:** "1800 × 808 px · ratio verified" / "check ratio"
- **Issue:** Build diagnostics rendered in the user interface. "ratio verified" is meaningless to a coach and "check ratio" is an instruction nobody can act on.
- **Category:** Jargon / Clarity
- **Suggested rewrite:** Not rewritten. `app.js` is the retired static prototype and is no longer served — the React app replaces it. Recommendation: delete `app.js`, `styles.css`, `offline_readme.txt` and `cards/`.

---

## Summary

- **Total strings scanned:** 871 user-facing strings across 29 files
- **Total issues found:** 10 (7 fixed, 2 borderline and left alone, 1 in a retired file)
- **Top 3 categories:**
  1. **Specificity** (4) — labels and errors that did not say which thing happened or what to do next
  2. **Clarity / Jargon** (4) — raw library errors and build diagnostics reaching the interface
  3. **Negative framing** (1) and **Conciseness** (1) — upgrade copy leading with the limit rather than the benefit
- **Copy health score:** **8.5 / 10**

  The body copy, empty states, tooltips and plan descriptions are strong: every
  tool explains what it is *and* how it is used, empty states name the next
  action, and the voice is consistent — plain, direct, coach-to-coach, no
  exclamation marks and no marketing filler. The score is held back by one real
  pattern rather than scattered weakness: **error and status paths were thinner
  than the happy paths.** Three of the seven fixes were in failure or
  in-progress states (raw auth errors, the generic "Working…" button, the
  ambiguous export toast), which is exactly where copy is written last and read
  most carefully. One issue was a factual mismatch between copy and behaviour —
  the locked-tool message promised access it did not grant — which is the kind
  of defect that costs trust rather than just clarity.
