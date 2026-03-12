# OpenCampaigns Shopify App

Integrate OpenCampaigns transparently into your Shopify merchant dashboard!

This repository contains a standalone Node.js and Express server mapping the Shopify Admin API and Webhooks to OpenCampaigns' decentralized standards.

## Features
- **App Proxies**: Binds your Shopify URL context directly to a `.well-known/opencampaigns.json` generator powered by our Node HTTP server.
- **Webhook Subscriptions**: Intercepts `products/update` and `discounts/create` payloads from Shopify, dynamically mutating them into campaign manifests and transmitting them natively to Nostr Relays as digital events.
- **In-Memory Schnorr Validation**: Safely manages generating offline Schnorr key algorithms using the `@opencampaigns/sdk` natively in the backend.

## License
MIT
