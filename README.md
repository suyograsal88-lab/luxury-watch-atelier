# Luxury Watch store setup

This site uses Supabase for customer accounts, the product catalogue, protected carts, orders, and administrator access. Razorpay Checkout is used for INR payments. Payment creation and verification happen in Supabase Edge Functions; no Razorpay secret belongs in browser code.

The hero animation also works when you open `index.html` directly as a local file. For Supabase sign-in, carts, admin, and checkout, serve the site over HTTP with Vite as described below; browsers block those module requests on `file://` pages.

GitHub Pages is configured to deploy the storefront from the `main` branch using `.github/workflows/pages.yml`. In Supabase Auth URL Configuration, include the deployed Pages URL plus `/login.html` in the allowed redirect URLs. For Edge Function CORS, set `APP_ORIGIN` to the site origin (for example, `https://YOUR-ACCOUNT.github.io`, without the repository path).

## Run the storefront locally

1. Install Node.js 20.19+ or 22.12+.
2. Open a terminal in this folder and run `npm install`.
3. Run `npm run dev` and open the local URL shown by Vite.
4. In Supabase **Authentication → URL Configuration**, add that URL (usually `http://127.0.0.1:5173`) to the allowed redirect URLs.

The Supabase project URL and publishable key are set in `supabase-client.js`. The publishable key is designed for browser use; database row-level security policies protect customer and administrator data.

## Apply the database and deploy payment functions

Install or run the Supabase CLI, then from this folder:

1. Run `npx supabase login` and `npx supabase link --project-ref iilxievhadgqejfwluer`.
2. Run `npx supabase db push` to apply `supabase/migrations/202610300001_store_backend.sql`.
3. In Supabase **Project Settings → Edge Functions → Secrets**, add:
   - `RAZORPAY_KEY_ID` — Razorpay test key ID.
   - `RAZORPAY_KEY_SECRET` — matching Razorpay test key secret.
   - `RAZORPAY_WEBHOOK_SECRET` — a webhook secret you choose and also enter in Razorpay.
   - `APP_ORIGIN` — the exact storefront origin, including scheme and port, such as `http://127.0.0.1:5173`.
4. Deploy `create-payment-order`, `verify-payment`, and `razorpay-webhook` from `supabase/functions` with `npx supabase functions deploy <function-name>`.
5. In Razorpay Dashboard **Webhooks**, add `https://iilxievhadgqejfwluer.supabase.co/functions/v1/razorpay-webhook`, use the same webhook secret, and enable `payment.captured`.
6. Enable automatic payment capture in Razorpay Dashboard.
7. Keep Razorpay in Test Mode until test checkout and webhook delivery both succeed. Replace the three Razorpay secrets with Live Mode values only when the merchant account is approved and the storefront is ready to take real orders.

The payment integration creates the payment amount from the database cart, checks Razorpay's captured-payment API response, verifies the checkout signature, and processes signed webhook events idempotently. A successful checkout is not shown as paid until server verification succeeds.

## Create the first administrator

1. Create your customer account through `account-register.html` and confirm its email if Supabase email confirmation is enabled.
2. In Supabase **SQL Editor**, run this query with the email address for your account:

   ```sql
   update public.profiles
   set role = 'admin'
   where email = lower('your-admin-email@example.com');
   ```

3. Sign out and back in. The Admin link appears in the header. The database policies also check the admin role, so hiding the link alone is not the access control.

## What is included

- Product catalogue seeded with the eight watches on the current storefront. Admins can add and edit products, change price and stock, and hide products.
- Supabase Auth sign-up, email confirmation, sign-in, and sign-out.
- Per-account carts with server-side price and stock checks at order creation.
- Customer order history and administrator order status management.
- Razorpay checkout, payment signature and capture verification, signed webhooks, and payment event deduplication.

The contact and private client enquiry forms remain preview-only. They do not write enquiries into the database.
