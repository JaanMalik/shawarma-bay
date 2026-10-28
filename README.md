# Shawarma Bay online ordering

Website, iPhone/Android app, and in-store order screen for **Shawarma Bay Deer Park**
(786 Grand Blvd, Deer Park, NY). Orders go straight into the restaurant's **Clover** account,
so they appear and print on the Clover device, and card payments go to the restaurant's
existing Clover merchant account.

```
packages/core   Shared menu, pricing, hours, and order rules (TypeScript, tested)
web             Next.js website + the API the app uses + the iPad order screen (/kitchen)
mobile          Expo (React Native) app for iPhone and Android
```

## How an order flows

1. The customer picks items on the website or in the app. The menu is read live from the
   restaurant's Clover inventory (refreshed about every minute), so prices and sold-out items
   match the register.
2. At checkout the server asks Clover to calculate the total and tax.
3. On "Place order" the server re-checks everything against the menu, then creates the order in
   Clover with the customer's name, phone, and pickup time in the order note.
4. If the customer pays online, the card is entered in Clover's own secure card fields
   (iframes), so card numbers never touch our server. The server charges the order through
   Clover's Ecommerce API; if the charge fails, the order is deleted again.
5. The order is sent to the Clover device's order printer, shows in Clover's Orders app, and
   pops up on the **iPad order screen** at `/kitchen` with a chime.

The mobile app uses the website's API. For card payments it opens the website's secure payment
page (`/app-pay`) in an in-app browser and comes back to the app when done.

## Run it locally (demo mode)

Requires Node 20+ and **npm 11+** (npm 10 has a bug installing this workspace; use
`npx npm@11 install` if `npm -v` shows 10).

```bash
npm install
npm run dev            # website on http://localhost:3000
npm test               # unit tests for the shared ordering rules
```

With no Clover settings the site runs in **demo mode**: built-in menu, pretend card payments
(you can choose approve or decline), orders kept in memory, and ordering open around the clock.
The order screen is at http://localhost:3000/kitchen with PIN **1234**.

Mobile app:

```bash
cp mobile/.env.example mobile/.env    # set EXPO_PUBLIC_API_URL to your computer's LAN IP
npm run mobile                        # then scan the QR code with Expo Go
```

## Connecting the real Clover account

Copy `web/.env.example` to `web/.env.local` (or set the same variables in Vercel). You need:

| Setting | Where it comes from |
| --- | --- |
| `NEXT_PUBLIC_CLOVER_MERCHANT_ID` | Shahzeb's Clover dashboard (the 13-character merchant ID) |
| `NEXT_PUBLIC_CLOVER_PUBLIC_KEY`, `CLOVER_ECOMMERCE_PRIVATE_KEY` | Clover dashboard → Settings → Ecommerce → **Ecommerce API Tokens**, type "Hosted iFrame + API/SDK" (needs two-factor sign-in on his account) |
| `CLOVER_API_TOKEN` | A token for Clover's Platform API with permission to read inventory and read/write orders (see below) |
| `KITCHEN_PIN` | Any PIN the staff will use on the iPad |

**Platform API token.** Clover's docs say tokens made in the merchant "API Tokens" screen are
meant for sandbox testing. For the live restaurant the supported route is a **private Clover
app**: create a free developer account at the Clover Global Developer Dashboard, create an app
(not public) with Inventory read and Orders read/write permissions, submit it for approval,
then Shahzeb installs it from a link. That gives an OAuth token. See
[Work with private apps](https://docs.clover.com/docs/private-apps).

**Test first in Clover's sandbox.** The developer dashboard includes a test merchant. Use its
merchant ID, a test API token, and test Ecommerce keys with `NEXT_PUBLIC_CLOVER_ENV=sandbox`
to try the full flow, including the kitchen printer, before touching the real account.

### Before going live

- [ ] **Token refresh.** Clover's OAuth access tokens expire and must be renewed with a
      single-use refresh token. This needs a small database to keep the latest token (for
      example Supabase or Vercel KV). Not built yet: `CLOVER_API_TOKEN` is a fixed token today.
- [ ] Confirm the opening hours for every day (`packages/core/src/restaurant.ts` assumes
      11 AM to 9 PM daily, from the Clover Online page on 2026-10-28).
- [ ] Confirm the options for "Customized Combo (Choice of Two)" are set up as a modifier
      group in Clover (the built-in menu guesses them).
- [ ] Replace the placeholder dish descriptions in `packages/core/src/menu-extras.ts` and the
      placeholder logo in `web/src/components/brand.tsx` and `mobile/assets/images`.
- [ ] Test a real ticket printing on the Clover device from the sandbox, then from production.
- [ ] Pick the domain, deploy, and set `NEXT_PUBLIC_SITE_URL`.

## Deploying the website

The website deploys to [Vercel](https://vercel.com) as-is: import the GitHub repo, set the
**Root Directory** to `web`, add the environment variables above, and deploy. Any Node host
that runs `next build` / `next start` works too.

## Setting up the restaurant's iPad

1. Open `https://<your-site>/kitchen` in Safari and enter the PIN.
2. Share → **Add to Home Screen**, then open it from the home screen (full screen).
3. Tap **Sound on** once so the chime can play (browsers need one tap first).
4. Settings → Display & Brightness → Auto-Lock → **Never**, and keep the iPad plugged in.

New orders flash with a chime every 20 seconds until someone taps **Start**; **Ready** moves
the order to "Done today". This progress is remembered on that iPad only.

## Publishing the app

The app is a standard Expo project, built in the cloud with EAS (no Mac needed):

```bash
cd mobile
npx eas-cli@latest build --platform all
npx eas-cli@latest submit --platform ios      # needs an Apple Developer account ($99/yr)
npx eas-cli@latest submit --platform android  # needs a Google Play account ($25 once)
```

Set `EXPO_PUBLIC_API_URL` to the live website first. The bundle ID `com.shawarmabay.deerpark`
in `mobile/app.json` is a placeholder; change it to one you own before the first build.

## Project notes

- All money is integer cents. Clover calculates the real tax; demo mode uses Suffolk County's
  8.625%.
- `packages/core/src/order-note.ts` defines the note format written to Clover orders (it prints
  on the ticket). The order screen reads it back, so change both sides together.
- The order-creation endpoint has a basic per-connection rate limit; it lives in memory, so it
  resets on each deploy.
