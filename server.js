require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PROMO_CONFIG_PATH = path.join(__dirname, 'promo-config.json');
let runtimePromoConfig = null;

function loadPromoConfigFromFile() {
  try {
    if (fs.existsSync(PROMO_CONFIG_PATH)) {
      runtimePromoConfig = JSON.parse(fs.readFileSync(PROMO_CONFIG_PATH, 'utf8'));
    }
  } catch (err) {
    console.warn('Could not load promo-config.json:', err.message);
  }
}

function getPromoConfig() {
  const cfg = runtimePromoConfig || {};
  return {
    code: (cfg.code ?? process.env.PROMO_CODE ?? '').trim(),
    validFrom: cfg.validFrom ?? process.env.PROMO_VALID_FROM ?? '',
    validUntil: cfg.validUntil ?? process.env.PROMO_VALID_UNTIL ?? '',
  };
}

function savePromoConfig({ code, validFrom, validUntil }) {
  runtimePromoConfig = { code, validFrom, validUntil };
  try {
    fs.writeFileSync(PROMO_CONFIG_PATH, JSON.stringify(runtimePromoConfig, null, 2));
  } catch (err) {
    console.warn('Could not persist promo-config.json:', err.message);
  }
}

function isValidAdminPin(pin) {
  const expected = process.env.ADMIN_PIN?.trim();
  return Boolean(expected && pin === expected);
}

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_CURRENCY = 'aud';
const publicDir = path.join(__dirname, 'public');

app.use(express.json());
// Absolute path so static assets resolve correctly on Vercel (cwd may not include public/).
app.use(express.static(publicDir));

app.get(['/', '/index.html'], (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/simulator-pay.html', (req, res) => {
  res.sendFile(path.join(publicDir, 'simulator-pay.html'));
});

async function resolveCheckout({ customerId, priceId }) {
  if (!customerId || !priceId) {
    throw new Error('customerId and priceId are required');
  }

  const [customer, price] = await Promise.all([
    stripe.customers.retrieve(customerId),
    stripe.prices.retrieve(priceId),
  ]);

  if (customer.deleted) {
    throw new Error('Customer not found');
  }
  if (!price.active) {
    throw new Error('Price is not active');
  }
  if (price.type !== 'one_time' || !price.unit_amount) {
    throw new Error('Price must be a one-time amount');
  }

  return {
    customer,
    price,
    amount: price.unit_amount,
    currency: price.currency,
  };
}

function mapCustomer(c) {
  return {
    id: c.id,
    name: c.name || c.email || 'Unnamed customer',
    email: c.email || null,
  };
}

function mapProduct(product, price) {
  return {
    id: product.id,
    name: product.name,
    priceId: price?.id || null,
    unitAmount: price?.unit_amount ?? null,
    currency: price?.currency ?? DEFAULT_CURRENCY,
  };
}

app.get('/api/customers', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const q = String(req.query.q || '').trim();

    if (!q) {
      const customers = await stripe.customers.list({ limit });
      return res.json({
        customers: customers.data.filter((c) => !c.deleted).map(mapCustomer),
      });
    }

    // Prefer Stripe Search for name/email; fall back to list + local filter.
    const sanitized = q.replace(/['\\]/g, '').slice(0, 100);
    try {
      const results = await stripe.customers.search({
        query: `name~'${sanitized}' OR email~'${sanitized}'`,
        limit,
      });
      return res.json({
        customers: results.data.filter((c) => !c.deleted).map(mapCustomer),
      });
    } catch (searchErr) {
      console.warn('Customer search unavailable, falling back to list:', searchErr.message);
      const customers = await stripe.customers.list({ limit: 100 });
      const needle = q.toLowerCase();
      const filtered = customers.data
        .filter((c) => !c.deleted)
        .filter((c) => {
          const name = (c.name || '').toLowerCase();
          const email = (c.email || '').toLowerCase();
          return name.includes(needle) || email.includes(needle);
        })
        .slice(0, limit)
        .map(mapCustomer);
      return res.json({ customers: filtered });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/customers', async (req, res) => {
  try {
    const name = req.body.name?.trim();
    const email = req.body.email?.trim() || undefined;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    const customer = await stripe.customers.create({ name, email });
    res.json({ customer: mapCustomer(customer) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const products = await stripe.products.list({
      limit,
      active: true,
      expand: ['data.default_price'],
    });
    const items = products.data
      .map((product) => {
        const price = product.default_price;
        if (!price || typeof price === 'string' || !price.unit_amount) {
          return null;
        }
        return mapProduct(product, price);
      })
      .filter(Boolean);
    res.json({ products: items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const name = req.body.name?.trim();
    const unitAmount = Number(req.body.unitAmount);
    const currency = (req.body.currency || DEFAULT_CURRENCY).toLowerCase();
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!Number.isInteger(unitAmount) || unitAmount <= 0) {
      return res.status(400).json({ error: 'unitAmount must be a positive integer (cents)' });
    }
    const product = await stripe.products.create({
      name,
      default_price_data: {
        unit_amount: unitAmount,
        currency,
      },
    });
    const price = await stripe.prices.retrieve(product.default_price);
    res.json({ product: mapProduct(product, price) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const { customerId, priceId } = req.body || {};
    const { amount, currency, customer, price } = await resolveCheckout({ customerId, priceId });

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      customer: customer.id,
      payment_method_types: ['card_present'],
      capture_method: 'manual',
      metadata: {
        price_id: price.id,
        product_id: typeof price.product === 'string' ? price.product : price.product?.id,
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount,
      currency,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/capture-payment-intent', async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    const paymentIntent = await stripe.paymentIntents.capture(paymentIntentId);
    res.json({ id: paymentIntent.id, status: paymentIntent.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pay', async (req, res) => {
  try {
    const { customerId, priceId } = req.body || {};
    const { amount, currency, customer, price } = await resolveCheckout({ customerId, priceId });

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      customer: customer.id,
      payment_method_types: ['card_present'],
      capture_method: 'manual',
      metadata: {
        price_id: price.id,
        product_id: typeof price.product === 'string' ? price.product : price.product?.id,
      },
    });

    await stripe.terminal.readers.processPaymentIntent(
      process.env.STRIPE_READER_ID,
      { payment_intent: paymentIntent.id }
    );

    res.json({
      paymentIntentId: paymentIntent.id,
      readerId: process.env.STRIPE_READER_ID,
      amount,
      currency,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/payment-status/:paymentIntentId', async (req, res) => {
  try {
    const { paymentIntentId } = req.params;

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const reader = await stripe.terminal.readers.retrieve(process.env.STRIPE_READER_ID);

    let piStatus = paymentIntent.status;
    const readerActionStatus = reader.action?.status || null;

    if (piStatus === 'requires_capture') {
      await stripe.paymentIntents.capture(paymentIntentId);
      piStatus = 'succeeded';
    }

    res.json({ piStatus, readerActionStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cancel-payment', async (req, res) => {
  try {
    const { paymentIntentId } = req.body;

    await stripe.terminal.readers.cancelAction(process.env.STRIPE_READER_ID);
    await stripe.paymentIntents.cancel(paymentIntentId);

    res.json({ cancelled: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function getPublicBaseUrl(req) {
  if (req.body?.payBaseUrl) {
    return req.body.payBaseUrl.replace(/\/$/, '');
  }
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return `http://localhost:${PORT}`;
}

function appendVercelBypass(url) {
  const secret = process.env.VERCEL_PROTECTION_BYPASS;
  if (!secret) {
    return url;
  }
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}x-vercel-protection-bypass=${encodeURIComponent(secret)}`;
}

app.post('/api/create-simulator-payment-intent', async (req, res) => {
  try {
    const payBaseUrl = getPublicBaseUrl(req);
    const { customerId, priceId } = req.body || {};
    const { amount, currency, customer, price } = await resolveCheckout({ customerId, priceId });

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      customer: customer.id,
      payment_method_types: ['card'],
      metadata: {
        price_id: price.id,
        product_id: typeof price.product === 'string' ? price.product : price.product?.id,
      },
    });

    res.json({
      paymentIntentId: paymentIntent.id,
      payUrl: appendVercelBypass(`${payBaseUrl}/simulator-pay.html?pi=${paymentIntent.id}`),
      amount,
      currency,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/simulator-payment-intent/:paymentIntentId', async (req, res) => {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(req.params.paymentIntentId);
    res.json({
      clientSecret: paymentIntent.client_secret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/simulator-payment-status/:paymentIntentId', async (req, res) => {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(req.params.paymentIntentId);
    res.json({ piStatus: paymentIntent.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/validate-promo', (req, res) => {
  const submittedCode = req.body.code?.trim().toUpperCase();
  const { code, validFrom: validFromStr, validUntil: validUntilStr } = getPromoConfig();
  const validCode = code.trim().toUpperCase();

  const now = new Date();
  const validFrom = new Date(validFromStr);
  const validUntil = new Date(validUntilStr);

  const codeMatches = submittedCode === validCode;
  const withinWindow = now >= validFrom && now <= validUntil;

  if (codeMatches && withinWindow) {
    return res.json({ valid: true });
  }

  if (!codeMatches) return res.json({ valid: false, reason: 'invalid_code' });
  if (now < validFrom) return res.json({ valid: false, reason: 'not_yet_active' });
  return res.json({ valid: false, reason: 'expired' });
});

app.get('/api/admin/promo', (req, res) => {
  const pin = req.headers['x-admin-pin'];
  if (!isValidAdminPin(pin)) {
    return res.status(401).json({ error: 'Invalid admin PIN' });
  }
  const { code, validFrom, validUntil } = getPromoConfig();
  res.json({ code, validFrom, validUntil });
});

app.put('/api/admin/promo', (req, res) => {
  const pin = req.headers['x-admin-pin'];
  if (!isValidAdminPin(pin)) {
    return res.status(401).json({ error: 'Invalid admin PIN' });
  }

  const code = req.body.code?.trim();
  const validFrom = req.body.validFrom?.trim();
  const validUntil = req.body.validUntil?.trim();

  if (!code || !validFrom || !validUntil) {
    return res.status(400).json({ error: 'code, validFrom, and validUntil are required' });
  }
  if (Number.isNaN(new Date(validFrom).getTime()) || Number.isNaN(new Date(validUntil).getTime())) {
    return res.status(400).json({ error: 'validFrom and validUntil must be valid ISO 8601 dates' });
  }

  savePromoConfig({ code, validFrom, validUntil });
  res.json({ saved: true, code, validFrom, validUntil });
});

loadPromoConfigFromFile();

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Mobile app: set API_BASE_URL in mobile/src/config.ts (Vercel) or BACKEND_HOST_LAN (local Wi‑Fi)');
  });
}

module.exports = app;
