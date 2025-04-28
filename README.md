# PayPal Agent Toolkit + OpenAI Demo

A fullstack demo app that lets you create PayPal orders using natural language prompts powered by OpenAI and PayPal Agent Toolkit.

## Setup

1. Clone repo
2. Install dependencies
3. Add a `.env` file with:
   - OPENAI_API_KEY
   - PAYPAL_CLIENT_ID
   - PAYPAL_CLIENT_SECRET
4. Run backend:
   npm run dev
6. Open localhost:3000 in browser

## Features
- Workflow mode (smart order creation)
- Toolkit mode (manual order building)
- Pretty UI with Tailwind CSS

## Examples
- Workflow : "Create a $50 PayPal order for a faucet installation service."
- Toolkit : "Create a PayPal order for 1 Premium Faucet at $120. Apply 12% tax. No shipping cost. Deliver to 123 Main Street, New York, NY 10001, USA."

