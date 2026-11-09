# Waterway Wellness Run Club site

Live at **waterwaywellness.co**. Edit code, push to `main`, and it deploys automatically.

## How it's hosted
- **Frontend:** Vercel. Root directory `artifacts/waterway-wellness`, output `dist`. Install command `pnpm install --no-frozen-lockfile --ignore-scripts`, build command `pnpm rebuild esbuild && pnpm build`.
- **Backend (shop API):** Render free web service, built from `render.yaml`. Vercel forwards `/api/*` to it (see `artifacts/waterway-wellness/vercel.json`). If the Render URL changes, update that file.
- **Database:** Neon Postgres (orders table). Schema in `lib/db/src/schema/`, push with `DATABASE_URL=... pnpm exec drizzle-kit push` from `lib/db`.
- **Keep-awake:** `.github/workflows/keepalive.yml` pings the backend every 10 min so the free Render service doesn't sleep.

## Backend environment variables (set on Render)
`PRINTIFY_API_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `DATABASE_URL`

## How the shop works
- Products come from Printify shop `26420569`. The four featured product IDs are hardcoded in `artifacts/api-server/src/lib/printify.ts`.
- Checkout: customer pays through Stripe, then the success page submits the order to Printify automatically.
- Discount code **ZINGO** = at-cost pricing. It's entered in the cart or via "Have a discount code?" in the Buy Now popup. Stripe's own promo field is turned off on purpose.
- Variant matching uses `options.includes(...)`, not position, because Printify's variant option order is inconsistent.

## Photos
- Real merch photos: `attached_assets/merch/`, mapped to product + color in `REAL_PHOTOS` in `artifacts/waterway-wellness/src/pages/shop-product.tsx`.
- Home page photo strip: `artifacts/waterway-wellness/public/community/` (listed in `PHOTOS` in `src/pages/home.tsx`).
- Resize photos before adding (about 1600px wide, JPEG). Big files slow the site down.

## Gotchas
- pnpm 11 reads build-script permissions from `allowBuilds:` in `pnpm-workspace.yaml`. Don't rely on `onlyBuiltDependencies`.
- The Mac-specific native packages were un-blocked in `pnpm-workspace.yaml` overrides; don't re-add the Linux-only exclusions.
