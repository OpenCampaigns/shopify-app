import 'dotenv/config';
import express from 'express';
import { shopifyApi, ApiVersion, Session } from '@shopify/shopify-api';
// Normally we'd use @shopify/shopify-app-express for the full OAuth scaffold,
// but for MVP specification of the endpoints and Webhooks we'll build a direct API logic implementation.
import {
    signCampaigns,
    generatePrivateKey,
    getPubKeyFromSecret
} from '@opencampaigns/sdk';

const PORT = parseInt(process.env.BACKEND_PORT || '', 10) || 3000;

// MVP: In-memory store for demonstrations. In production, use Redis/Postgres for Sessions & Keys.
const ACTIVE_SHOPIFY_SHOPS = {};
const MERCHANT_KEYS = {};

const shopify = shopifyApi({
    apiKey: process.env.SHOPIFY_API_KEY || 'fake-api-key',
    apiSecretKey: process.env.SHOPIFY_API_SECRET || 'fake-api-secret',
    scopes: ['read_products', 'read_discounts'],
    hostName: process.env.HOST?.replace(/https?:\/\//, '') || 'localhost:3000',
    apiVersion: ApiVersion.April24,
    isEmbeddedApp: true,
});

const app = express();

/**
 * Task 5.1: Integrate Shopify Admin API for discounts/products
 */
async function fetchActiveCampaigns(shop, session) {
    // Mocking the GraphQL or REST API call to Shopify to fetch products tagged for OpenCampaigns
    // const client = new shopify.clients.Graphql({ session });
    // const res = await client.query({ ... })

    // Return mocked data matching the schema
    return [
        {
            id: `shopify-promo-1`,
            type: 'offer',
            title: `Storewide Sale at ${shop}`,
            description: 'Get 20% off all items',
            url: `https://${shop}/discount/OPEN20`,
            tags: ['apparel', 'sale'],
            tracking: {
                engine: 'custom',
                parameters: [{ key: 'utm_source', value: 'opencampaigns_shopify' }]
            }
        }
    ];
}

/**
 * Task 5.2: App Proxy for JSON file hosting
 * This endpoint will be mapped in the Shopify Partner Dashboard to:
 * https://{shop.myshopify.com}/apps/opencampaigns/.well-known/opencampaigns.json
 */
app.get('/api/proxy/well-known/opencampaigns.json', async (req, res) => {
    // Shopify App Proxies send the shop domain in the query signature
    const shop = req.query.shop;

    if (!shop || !MERCHANT_KEYS[shop]) {
        return res.status(404).json({ error: 'Shop not registered or keys missing.' });
    }

    const keys = MERCHANT_KEYS[shop];
    const session = ACTIVE_SHOPIFY_SHOPS[shop];

    try {
        const campaigns = await fetchActiveCampaigns(shop, session);

        // Convert hex private key to Uint8Array for signing
        const privBytes = new Uint8Array(Buffer.from(keys.priv, 'hex'));

        const signature = signCampaigns(campaigns, privBytes);

        const manifest = {
            version: "1.0",
            publisher: {
                name: shop,
                website: `https://${shop}`,
                pubkey: keys.pub
            },
            campaigns,
            signature
        };

        // App proxies expect standard app-level headers
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200).send(manifest);

    } catch (error) {
        console.error('Failed to generate App Proxy manifest', error);
        res.status(500).json({ error: 'Failed to generate campaign manifest' });
    }
});

/**
 * Task 5.3: Webhooks for auto-update Nostr events
 * (Placeholder for webhook registration and receiving)
 */
app.post('/api/webhooks', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const { topic, shop, webhookId } = await shopify.webhooks.process({
            rawBody: req.body,
            rawRequest: req,
            rawResponse: res,
        });

        console.log(`[Webhook] Received ${topic} for ${shop}`);

        // When a product updates, we should theoretically re-fetch the campaigns,
        // re-sign the payload, and emit a Nostr event via @opencampaigns/sdk NostrRelayClient
        // let relayClient = new NostrRelayClient(['wss://relay.damus.io']);
        // relayClient.publishEvent({ ... });

    } catch (error) {
        console.error(error.message);
    }
});

// Mock Setup Endpoint (simulating Admin UI generating keys)
app.post('/api/setup-keys', express.json(), (req, res) => {
    const shop = req.body.shop;
    if (!shop) return res.status(400).send('Missing shop');

    const privBytes = generatePrivateKey();
    const pubHex = getPubKeyFromSecret(privBytes);
    const privHex = Buffer.from(privBytes).toString('hex');

    MERCHANT_KEYS[shop] = { pub: pubHex, priv: privHex };
    ACTIVE_SHOPIFY_SHOPS[shop] = new Session({
        id: `offline_${shop}`,
        shop: shop,
        state: 'mock',
        isOnline: false,
        accessToken: 'mock_token'
    });

    res.json({ success: true, keys: MERCHANT_KEYS[shop] });
});

app.listen(PORT, () => {
    console.log(`OpenCampaigns Shopify Mock App running on port ${PORT}`);
});
