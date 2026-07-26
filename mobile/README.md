# Social Booth — Mobile (Apps on Devices)

React Native app for the **Stripe Reader S710**, using [Apps on Devices](https://docs.stripe.com/terminal/features/apps-on-devices/build?terminal-sdk-platform=react-native).

The S710 runs this app as its kiosk UI. Your laptop runs the Express backend for PaymentIntent creation, capture, and promo validation.

---

## Architecture

```
S710 (this app)  ──SDK handoff──►  Stripe Reader app (card collection)
       │
       └── HTTP ──►  Laptop Express server (port 3000)
                         └── Stripe API
```

---

## One-time setup

### 1. Install dependencies

From the repo root:

```bash
npm install
```

From the mobile folder:

```bash
cd mobile
npm install
```

### 2. Configure environment

Copy and fill in Stripe keys at the repo root:

```bash
cp .env.example .env
```

Edit `.env` with your `STRIPE_SECRET_KEY` and `STRIPE_READER_ID`.

### 3. Android SDK (first time only)

You need Android Studio and the SDK. If Gradle fails with `SDK location not found`:

1. Install [Android Studio](https://developer.android.com/studio)
2. Add to `~/.zshrc`:

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator
```

3. Reload your shell:

```bash
source ~/.zshrc
```

4. Create `mobile/android/local.properties` (if missing):

```properties
sdk.dir=/Users/YOUR_USERNAME/Library/Android/sdk
```

### 4. Configure the mobile app

Edit `mobile/src/config.ts`:

| Setting | Purpose |
|---------|---------|
| `API_BASE_URL` | **Production:** your Vercel URL (e.g. `https://your-app.vercel.app`). Leave `''` for local Wi‑Fi dev. |
| `BACKEND_HOST_LAN` | Fallback laptop Wi‑Fi IP when `API_BASE_URL` is empty |
| `getApiBaseUrl()` | Auto: emulator → `10.0.2.2`, device → `API_BASE_URL` or `BACKEND_HOST_LAN` |
| `isSimulatorMode()` | Auto: emulator skips reader discovery; S710 connects |

**Local dev (S710 on same Wi‑Fi as laptop):** leave `API_BASE_URL = ''` and set `BACKEND_HOST_LAN`:

```bash
ipconfig getifaddr en0
```

```ts
export const API_BASE_URL = '';
export const BACKEND_HOST_LAN = '192.168.x.x';
```

**Production (S710 anywhere with internet):** deploy backend to Vercel (see below), then set:

```ts
export const API_BASE_URL = 'https://social-booth-app-on-device.vercelapp.stripe.dev';
```

Rebuild the release APK after changing config.

---

## Deploy backend to Vercel

Use a stable HTTPS URL so the S710 does not depend on your laptop IP.

### 1 — Deploy

From the repo root:

```bash
npx vercel
```

Set environment variables in the Vercel project (same keys as `.env.example`):

- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_READER_ID`
- `PROMO_CODE`, `PROMO_VALID_FROM`, `PROMO_VALID_UNTIL`
- `PUBLIC_BASE_URL` = `https://social-booth-app-on-device.vercelapp.stripe.dev`
- `VERCEL_PROTECTION_BYPASS` = your 32-char bypass secret (for simulator pay URLs)

### 1b — Vercel Deployment Protection bypass (mobile app)

If Deployment Protection is enabled, create a bypass secret under **Settings → Deployment Protection → Protection Bypass for Automation**.

1. Copy the secret into `mobile/src/secrets.ts` (create from `secrets.example.ts` — **gitignored**)
2. Add the same value as `VERCEL_PROTECTION_BYPASS` in Vercel env vars (for simulator pay page)

The mobile app sends `x-vercel-protection-bypass` on every API request to your Vercel domain.

### 2 — Smoke-test

```bash
curl -X POST https://social-booth-app-on-device.vercelapp.stripe.dev/api/validate-promo \
  -H 'Content-Type: application/json' \
  -H 'x-vercel-protection-bypass: YOUR_BYPASS_SECRET' \
  -d '{"code":"YOUR_PROMO_CODE"}'
```

### 3 — Point the mobile app

Set `API_BASE_URL` in `mobile/src/config.ts` and ensure `mobile/src/secrets.ts` has your bypass token. Bump `versionCode`, rebuild APK, redeploy to S710.

Emulator dev still uses `http://10.0.2.2:3000` with local `npm run dev` — no Vercel URL needed on emulator.

---

## Run on Android emulator (UI preview)

Use this to preview the Social Booth UI on your laptop. **Card payments require the S710 DevKit** — the emulator only previews the UI and promo validation.

You need **three terminals**. Run each block separately (do not paste comments on the same line as commands).

### Terminal 1 — Backend

```bash
cd ~/stripe/FFDemo/SocialBooth_AppOnDevice
npm run dev
```

Wait until you see:

```
Server running at http://localhost:3000
```

Leave this terminal open.

### Terminal 2 — Android emulator

**Option A — Android Studio (recommended)**

1. Open **Android Studio**
2. Go to **Device Manager** (phone icon in the toolbar)
3. Find **SocialBoothEmu** (or create a Pixel device with API 36)
4. Click **Play** and wait until the virtual phone finishes booting

**Option B — Command line**

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools
emulator -avd SocialBoothEmu -gpu swiftshader_indirect
```

Or from the repo root:

```bash
zsh mobile/scripts/launch-emulator.sh
```

**Verify the emulator is connected:**

```bash
adb devices
```

Expected output:

```
List of devices attached
emulator-5554    device
```

If the list is empty, wait for the emulator to finish booting and run `adb devices` again.

### Terminal 3 — Metro bundler

**Important:** Metro must run from the `mobile/` folder, not another React Native project.

```bash
cd ~/stripe/FFDemo/SocialBooth_AppOnDevice/mobile
npm start
```

Wait until you see Metro ready on port **8081**. Leave this terminal open.

If you get `EADDRINUSE` on port 8081, an old Metro is already running. Either reuse it and skip to Terminal 4, or free the port:

```bash
lsof -i :8081
kill <PID>
npm start
```

Check the process is from **this** project (not another app):

```bash
lsof -i :8081
```

The working directory should be `SocialBooth_AppOnDevice/mobile`.

### Terminal 4 — Install and launch the app

Open a **new** terminal:

```bash
cd ~/stripe/FFDemo/SocialBooth_AppOnDevice/mobile
npm run android
```

The Social Booth app should open in the emulator.

**Reload after code changes:** press **R** twice in the Metro terminal, or shake the emulator (Ctrl+M / Cmd+M) and tap **Reload**.

---

## Emulator quick reference

| Step | Command | Terminal |
|------|---------|----------|
| 1 | `npm run dev` (repo root) | Backend |
| 2 | Launch **SocialBoothEmu** in Android Studio | Emulator |
| 3 | `npm start` (in `mobile/`) | Metro |
| 4 | `npm run android` (in `mobile/`) | Install app |

---

## What works in the emulator

| Feature | Emulator |
|---------|----------|
| Social Booth UI | Yes |
| Pay with Promo | Yes (calls laptop backend) |
| Pay Now / card tap | No — requires S710 DevKit |

---

## Run on S710 DevKit (USB)

1. Complete [one-time setup](#one-time-setup) above
2. Set `API_BASE_URL` to your Vercel URL, or leave empty and set `BACKEND_HOST_LAN` for local Wi‑Fi
3. Emulator vs S710 is detected automatically — no manual simulator flag
4. Connect DevKit via USB and enable USB debugging
5. Verify: `adb devices` shows your reader
6. Run backend (`npm run dev`), Metro (`npm start`), then `npm run android`

On first launch the app will request location permission, connect to the reader via Apps on Devices, and show the home screen.

---

## Upload to Stripe Dashboard

Upload the **Android APK** to Stripe for review, then deploy it to your S710. The web UI in `public/` is not uploaded — only the mobile app.

Docs: [Submit your app](https://docs.stripe.com/terminal/features/apps-on-devices/submit) · [Deploy your app](https://docs.stripe.com/terminal/features/apps-on-devices/deploy)

### Before you upload

| Requirement | Details |
|-------------|---------|
| **Apps on Devices** | Enabled on your Stripe account (contact Stripe if needed) |
| **S710 registered** | Dashboard → **Terminal → Readers** |
| **Location created** | Dashboard → **Terminal → Locations** |
| **Production config** | In `src/config.ts`: set `API_BASE_URL` to your Vercel HTTPS URL (or `BACKEND_HOST_LAN` for local Wi‑Fi) |
| **Package name** | `com.socialboothmobile` — must match Dashboard exactly |

### Step 1 — Bump version and build a release APK

Stripe rejects uploads if the same **package name**, **version code**, and **build variant** already exist. Increment `versionCode` in `mobile/android/app/build.gradle` before every upload (including resubmissions after review):

```gradle
defaultConfig {
    ...
    versionCode 2        // was 1 — increment every upload
    versionName "1.0.1"  // optional, for your own tracking
}
```

Rebuild the release APK:

```bash
cd ~/stripe/FFDemo/SocialBooth_AppOnDevice/mobile/android
./gradlew assembleRelease
```

Output file:

```
mobile/android/app/build/outputs/apk/release/app-release.apk
```

APK must be **≤ 200 MB**. For production you will need a release keystore; confirm signing requirements with Stripe for your first submission.

### Step 2 — Create the app in Dashboard

1. Open [Stripe Dashboard](https://dashboard.stripe.com) (correct account and mode: test or live)
2. Go to **Terminal → Software**
3. Click **Create app**
4. Enter:
   - **App name:** `Social Booth`
   - **Package name:** `com.socialboothmobile`
5. Click **Create app**

### Step 3 — Upload APK for review

On the app details page:

1. Click **Upload** / **Submit for review**
2. In the upload dialog:
   - **Compatible devices:** select **S710** (and S700 if applicable)
   - **Upload APK:** choose `app-release.apk`
   - **Reviewer instructions:** how to reach your backend, test promo code, that Pay requires a DevKit
   - **Email:** address for review status updates
3. Click **Submit for review**

Stripe must **approve** the app before you can deploy it to readers.

### Step 4 — Wait for approval

Monitor status via:

- Email from Stripe
- **Terminal → Software** → your app → review status
- Webhooks: `terminal.device_asset_version.app_review_approved` or `app_review_rejected`

If rejected, fix the issues, bump the app version, rebuild the APK, and resubmit.

### Step 5 — Create a deploy group (first time)

Readers must belong to a location assigned to a deploy group.

1. **Terminal → Software** → **Manage deploy groups**
2. Click **Add deploy group**
3. Enter a name (e.g. `Social Booth Alpha` for internal DevKit testing)
4. Choose device type **S710**
5. Click **Done**
6. Open the deploy group → **Add locations** → select the location where your S710 is registered

Recommended rollout: **Alpha** (DevKit) → **Beta** → **General** (production).

### Step 6 — Deploy to your reader

After approval:

1. **Terminal → Software** → open **Social Booth**
2. Click **Deploy version**
3. Select the **approved version** → **Next**
4. Choose your **deploy group** → **Next**
5. Set rollout / mandatory update options → **Next**
6. **Preferred kiosk app:** select **Social Booth**  
   (the reader launches this on boot and after each transaction)
7. Confirm → **Deploy**

The reader downloads the app, reboots, and installs it. Reboot manually to apply updates immediately.

### Step 7 — Verify on the S710

1. Reader shows **Online** in **Terminal → Readers**
2. Backend is running with valid `.env`
3. `API_BASE_URL` (or `BACKEND_HOST_LAN`) is reachable from the reader
4. Social Booth launches as the kiosk app on the reader

### Upload checklist

```
[ ] Apps on Devices enabled
[ ] API_BASE_URL or BACKEND_HOST_LAN set in mobile/src/config.ts
[ ] Bump versionCode in mobile/android/app/build.gradle
[ ] ./gradlew assembleRelease
[ ] Dashboard → Terminal → Software → Create app (com.socialboothmobile)
[ ] Upload APK → Submit for review
[ ] Review approved
[ ] Create deploy group + add location
[ ] Deploy version → set Social Booth as kiosk app
[ ] Reboot reader → app appears
```

| Action | Where in Dashboard |
|--------|-------------------|
| Upload APK | **Terminal → Software → Create/Upload app** |
| Install on reader | **Deploy version** to a **deploy group** |
| Web UI (`public/`) | Not uploaded — Android APK only |

---

## Backend API (mobile)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/create-payment-intent` | Returns `clientSecret` for SDK |
| `POST /api/capture-payment-intent` | Captures manual-capture PI |
| `POST /api/validate-promo` | Promo code validation |

---

## Project layout

```
mobile/
├── App.tsx              # Screens + payment/promo flow
├── Root.tsx             # StripeTerminalProvider (AoD token provider)
├── src/
│   ├── config.ts        # API_BASE_URL, BACKEND_HOST_LAN
│   ├── api.ts           # Backend fetch helpers
│   ├── theme.ts         # Social Booth colors
│   └── components/      # Logo, Button
├── scripts/
│   ├── launch-emulator.sh
│   └── setup-android-env.sh
└── android/             # Native config (TerminalApplicationDelegate)
```

---

## Troubleshooting

### `EADDRINUSE` on port 8081

Metro is already running. Reuse it, or kill the old process:

```bash
lsof -i :8081
kill <PID>
```

### Red screen: `Unable to resolve module ./App` from wrong path

Metro is serving a **different project**. Kill port 8081 and restart Metro from `mobile/`:

```bash
lsof -i :8081
kill <PID>
cd mobile
npm start
```

### `adb devices` is empty

- Wait for the emulator to finish booting
- Launch the emulator in Android Studio first
- For DevKit: use a data USB cable, enable USB debugging, accept the RSA prompt on the reader

### `SDK location not found`

Set `ANDROID_HOME` and create `mobile/android/local.properties` — see [one-time setup](#3-android-sdk-first-time-only).

### `Network error` on promo

- Backend must be running (`npm run dev`)
- Emulator: local backend at `10.0.2.2:3000` (automatic)
- Physical device: `API_BASE_URL` (Vercel) or `BACKEND_HOST_LAN` (Wi‑Fi)

### Pay button disabled (DevKit) / stuck on "Connecting to reader…"

**Pay Now** stays disabled until the Stripe Terminal SDK connects to the built-in reader — this is separate from your laptop backend (promo can work while Pay Now is still greyed out).

Checklist:

1. **Location permission** — accept the prompt on first launch; without it, reader connection fails.
2. **Reader online** — Dashboard → **Terminal → Readers** → your S710 shows **Online**.
3. **Same Stripe mode** — test APK uses test mode; live APK uses live mode.
4. **Apps on Devices enabled** on your Stripe account.
5. **Deployed kiosk app** — after Dashboard approval, deploy the version and reboot the reader.
6. **Status message** — if it shows `Init error:` or `Reader error:`, that text is the actual failure (not a backend issue).

If the status stays on "Connecting to reader…" with no error, reboot the S710 and relaunch the app. After code changes, bump `versionCode`, rebuild the release APK, redeploy, and reboot.

Wait for reader connection, or check Apps on Devices is enabled on your Stripe account.

### `Asset version with same package name, version code and build variant already exists`

You already uploaded this `versionCode`. Bump it in `mobile/android/app/build.gradle`, rebuild with `./gradlew assembleRelease`, and upload the new APK. See [Step 1](#step-1--bump-version-and-build-a-release-apk).

### Port 3000 in use (backend)

```bash
lsof -i :3000
kill <PID>
```

Or change `PORT` in `.env`.
