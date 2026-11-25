# ShopifyStore AI

ShopifyStore AI is an AI-powered Shopify inventory and store-management copilot. It combines a conversational assistant with a responsive merchant dashboard, allowing store operators to review products, manage inventory, and inspect recent orders from one workspace.

## Overview

The assistant uses Google Gemini through the Vercel AI SDK and Shopify's Admin GraphQL API. It can look up products before making changes, helping ensure product, variant, and inventory item IDs come from Shopify rather than being guessed. The dashboard's chat access and Shopify API routes are protected by an admin password.

Chat sessions are saved in the browser's local storage. Shopify credentials and AI requests are handled by server-side routes; do not expose credentials in client-side code.

## Key Features

- Chat with an AI assistant about products, stock, and recent orders.
- Search and browse the product catalog, including status, price, vendor, variants, and stock.
- Create, edit, publish, and delete products.
- Review inventory levels and set exact available quantities.
- View recent orders and store health summaries, including low-stock variants.
- Keep multiple conversations in browser local storage and resume them later.
- Use a responsive dashboard with password-protected API access.

## Tech Stack

- [Next.js](https://nextjs.org/) App Router and React
- TypeScript
- [Tailwind CSS](https://tailwindcss.com/)
- [Vercel AI SDK](https://ai-sdk.dev/) with the Google provider and Gemini 3.5 Flash-Lite
- [Shopify Admin GraphQL API](https://shopify.dev/docs/api/admin-graphql) (API version `2026-04`)
- Zod for request and tool input validation
- Framer Motion and Lucide React for interface animation and icons

## Local Setup

### Requirements

- Node.js 20.9 or later
- A Google AI API key
- A Shopify store and Shopify app credentials with the Admin API access required for products, inventory, and orders

### Install and run

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Copy the example environment file to `.env.local`:

   ```powershell
   # Windows PowerShell
   Copy-Item .env.example .env.local
   ```

   ```bash
   # macOS or Linux
   cp .env.example .env.local
   ```

3. Fill in the values in `.env.local` as described below.
4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

Useful project checks:

```bash
npm run lint
npm run build
npm start
```

## Environment Variables

Create `.env.local` from `.env.example` and supply the values for your own Google AI and Shopify app. Keep `.env.local` private; it is excluded by `.gitignore`. The example file intentionally contains empty values only.

| Variable | Description |
| --- | --- |
| `GOOGLE_GENERATIVE_AI_API_KEY` | API key used by the Google provider for Gemini requests. |
| `SHOPIFY_STORE_DOMAIN` | Your store's `*.myshopify.com` domain. |
| `SHOPIFY_CLIENT_ID` | Client ID for the Shopify app using the client credentials grant. |
| `SHOPIFY_CLIENT_SECRET` | Client secret for that Shopify app. The server exchanges it for an Admin API access token. |
| `ADMIN_CHAT_PASSWORD` | Password required to unlock the dashboard and authorize protected API requests. Use a strong, unique value. |

Never commit real credentials. Configure equivalent environment variables in your hosting provider before deploying.
