# agents.md — Stripe Terminal Demo App

## Project Overview

Build a minimal POS demo web app with a Node.js + Express backend and a vanilla HTML/CSS/JS frontend (no framework). The app runs in a browser (tablet or laptop) and controls a **Stripe Terminal S710** smart reader via Stripe's **Server-Driven Integration** API.

---

## Tech Stack

| Layer    | Choice                              |
|----------|-------------------------------------|
| Backend  | Node.js + Express                   |
| Frontend | Vanilla HTML + CSS + JS (no bundler)|
| Payments | Stripe Node SDK + Terminal Server-Driven API |
| Config   | dotenv                              |

---

## File Structure

```
/
├── server.js            # Express backend — all API routes
├── .env                 # Secret config (never commit)
├── .env.example         # Committed template for .env
├── package.json
└── public/
    ├── index.html       # Single-page app — all screens in one file
    ├── style.css        # Minimal, clean touch-friendly styles
    └── app.js           # Frontend JS — screen routing + API calls
```

---

## Environment Variables

### `.env`
```dotenv
# Stripe
STRIPE_SECRET_KEY=sk_test_...

# Terminal — the registered reader ID (tmr_...)
STRIPE_READER_ID=tmr_...

# Promo code validation
PROMO_CODE=DEMO2026
PROMO_VALID_FROM=2026-07-01T00:00:00+10:00
PROMO_VALID_UNTIL=2026-08-31T23:59:59+10:00

# Server
PORT=3000
```

### `.env.example`
Same keys as above, with placeholder values. Commit this file.

### Notes
- `PROMO_VALID_FROM` / `PROMO_VALID_UNTIL` are ISO 8601 with timezone offset (AEST/AEDT). The backend compares these against `new Date()` (UTC-based), so include the offset to handle DST correctly.
- `PROMO_CODE` comparison must be **case-insensitive** (`.toUpperCase()` both sides).

---

## Backend — `server.js`

### Setup
```
npm install express stripe dotenv
```

Express serves the `public/` folder as static files. All API routes are under `/api`.

### Stripe Initialization
```js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
```

---

### API Routes

#### `POST /api/pay`
Creates an $8.00 AUD PaymentIntent and immediately sends it to the S710 reader to collect.

**Request body:** none required

**Logic:**
1. Create a PaymentIntent:
   ```js
   stripe.paymentIntents.create({
     amount: 800,           // cents — $8.00 AUD
     currency: 'aud',
     payment_method_types: ['card_present'],
     capture_method: 'manual',
   })
   ```
2. Process on the reader:
   ```js
   stripe.terminal.readers.processPaymentIntent(
     process.env.STRIPE_READER_ID,
     { payment_intent: paymentIntent.id }
   )
   ```
3. Return `{ paymentIntentId, readerId }` to the frontend.

**Error handling:** If either call fails, return `{ error: message }` with HTTP 500.

---

#### `GET /api/payment-status/:paymentIntentId`
Polls the status of the PaymentIntent so the frontend knows when to proceed.

**Logic:**
1. Retrieve the PaymentIntent:
   ```js
   stripe.paymentIntents.retrieve(paymentIntentId)
   ```
2. Also retrieve the reader to check action status:
   ```js
   stripe.terminal.readers.retrieve(process.env.STRIPE_READER_ID)
   ```
3. Return:
   ```json
   {
     "piStatus": "requires_capture | succeeded | canceled | payment_failed",
     "readerActionStatus": "in_progress | succeeded | failed"
   }
   ```
4. If `piStatus === "requires_capture"`, also call:
   ```js
   stripe.paymentIntents.capture(paymentIntentId)
   ```
   Then return `{ piStatus: "succeeded" }`.

---

#### `POST /api/validate-promo`
Validates a promo code against the `.env` values.

**Request body:** `{ "code": "DEMO2026" }`

**Logic:**
```js
const submittedCode = req.body.code?.trim().toUpperCase();
const validCode = process.env.PROMO_CODE?.trim().toUpperCase();

const now = new Date();
const validFrom = new Date(process.env.PROMO_VALID_FROM);
const validUntil = new Date(process.env.PROMO_VALID_UNTIL);

const codeMatches = submittedCode === validCode;
const withinWindow = now >= validFrom && now <= validUntil;

if (codeMatches && withinWindow) {
  return res.json({ valid: true });
}

// Return a specific reason for better UX
if (!codeMatches) return res.json({ valid: false, reason: 'invalid_code' });
if (now < validFrom) return res.json({ valid: false, reason: 'not_yet_active' });
return res.json({ valid: false, reason: 'expired' });
```

---

## Frontend — `public/`

### Screen Architecture
All screens live inside `index.html` as `<div>` blocks with `class="screen"`. Only one screen is visible at a time. `app.js` manages navigation via a `showScreen(id)` helper that hides all screens and shows the target.

### Screens

#### 1. `#screen-home`
The default screen shown on load.

**Contents:**
- App title (e.g. "Stripe Demo")
- Two large, full-width, touch-friendly buttons:
  - **"Pay Now"** — calls `POST /api/pay`
  - **"Pay with Promo"** — navigates to `#screen-promo-entry`

---

#### 2. `#screen-processing`
Shown while waiting for the Terminal reader to collect payment.

**Contents:**
- Spinner / loading indicator
- Text: "Waiting for card…"
- Sub-text: "Please tap, insert, or swipe on the reader."
- A **Cancel** button that calls `POST /api/cancel-payment` (see below) and returns to Home

**Behavior:**
- On entering this screen, the frontend starts polling `GET /api/payment-status/:paymentIntentId` every 2 seconds.
- On `piStatus === "succeeded"` → navigate to `#screen-payment-success`
- On `readerActionStatus === "failed"` or `piStatus === "payment_failed"` or `piStatus === "canceled"` → navigate to `#screen-payment-failed`

---

#### 3. `#screen-payment-success`
**Contents:**
- Large green checkmark icon (use Unicode ✓ or inline SVG)
- Text: "Payment successful!"
- Sub-text: "$8.00 AUD"
- **"Done"** button → returns to `#screen-home`
- Auto-returns to Home after 5 seconds

---

#### 4. `#screen-payment-failed`
**Contents:**
- Large red ✗ icon
- Text: "Payment unsuccessful"
- Sub-text: "Please try again or contact staff."
- **"Try Again"** button → returns to `#screen-home`

---

#### 5. `#screen-promo-entry`
**Contents:**
- Heading: "Enter Promo Code"
- A single text input (`type="text"`, `placeholder="e.g. DEMO2026"`, `autocomplete="off"`, `autocorrect="off"`)
- **"Validate"** button → calls `POST /api/validate-promo`
- **"Back"** button → returns to `#screen-home`

**Behavior:**
- On submit, show a brief inline spinner on the button while the request is in flight.
- On response, navigate to `#screen-promo-success` or `#screen-promo-failed`.
- Input should be automatically `.toUpperCase()`'d as the user types (use `input` event listener).

---

#### 6. `#screen-promo-success`
**Contents:**
- Large green checkmark
- Text: "Promo code accepted!"
- **"Done"** button → returns to `#screen-home`

---

#### 7. `#screen-promo-failed`
**Contents:**
- Large red ✗
- Text: varies by `reason` returned from the API:
  - `invalid_code` → "Invalid promo code. Please try again."
  - `not_yet_active` → "This promo code is not active yet."
  - `expired` → "This promo code has expired."
- **"Try Again"** button → returns to `#screen-promo-entry`

---

### Additional Backend Route (for Cancel)

#### `POST /api/cancel-payment`
**Request body:** `{ "paymentIntentId": "pi_..." }`

**Logic:**
```js
// Cancel the reader action first
await stripe.terminal.readers.cancelAction(process.env.STRIPE_READER_ID);
// Then cancel the PaymentIntent
await stripe.paymentIntents.cancel(paymentIntentId);
res.json({ cancelled: true });
```
Return `{ error }` with HTTP 500 on failure.

---

## Styling Guidelines (`style.css`)

- Target viewport: portrait tablet or desktop browser (~420–800px wide)
- Body: dark-ish background (`#0a2540`), white text — Stripe's brand palette
- Buttons: minimum `60px` height, `border-radius: 8px`, full width, large font (`18px+`)
- "Pay Now" button: Stripe purple (`#635BFF`)
- "Pay with Promo" button: outlined / secondary style
- Success states: `#00D66B` (Stripe green)
- Error states: `#FF4444`
- Screen transitions: simple CSS `opacity` + `display` toggle — no animation libraries needed
- Center all screen content vertically using flexbox

---

## package.json

```json
{
  "name": "stripe-terminal-demo",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "dotenv": "^16.0.0",
    "express": "^4.18.0",
    "stripe": "^14.0.0"
  }
}
```

---

## Key Implementation Notes

### Terminal Reader Must Be Pre-Registered
The `STRIPE_READER_ID` (`tmr_...`) in `.env` must already be registered in your Stripe Dashboard under **Terminal → Readers**. This app does not handle reader registration.

### Polling vs Webhooks
This app uses **client-side polling** (`setInterval` every 2 seconds) for simplicity. In production, replace with Stripe webhooks listening for `terminal.reader.action_succeeded` and `terminal.reader.action_failed`.

### Test Mode
Use `sk_test_...` for the secret key during development. Use the physical S710 in test mode — swipe the test card or tap a test card/phone. The simulated reader does **not** work with the Server-Driven API.

### Reader Must Be Online
The S710 must be connected to Wi-Fi or cellular and in an idle state (not in the middle of another transaction) before `process_payment_intent` is called.

### AUD Currency
Stripe amounts are always in the smallest currency unit. AUD uses cents, so `$8.00 = 800`.

### Promo Timezone
`PROMO_VALID_FROM` and `PROMO_VALID_UNTIL` should include the AEST/AEDT UTC offset (`+10:00` standard, `+11:00` daylight saving) so JavaScript's `new Date()` parses them correctly in UTC.

---

## How to Run

```bash
cp .env.example .env
# Fill in STRIPE_SECRET_KEY, STRIPE_READER_ID, promo settings

npm install
npm run dev
# Open http://localhost:3000 in browser
```
