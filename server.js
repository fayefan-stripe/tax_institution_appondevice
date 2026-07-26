require('dotenv').config();

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 800,
      currency: 'aud',
      payment_method_types: ['card_present'],
      capture_method: 'manual',
    });

    res.json({ clientSecret: paymentIntent.client_secret });
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
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 800,
      currency: 'aud',
      payment_method_types: ['card_present'],
      capture_method: 'manual',
    });

    await stripe.terminal.readers.processPaymentIntent(
      process.env.STRIPE_READER_ID,
      { payment_intent: paymentIntent.id }
    );

    res.json({
      paymentIntentId: paymentIntent.id,
      readerId: process.env.STRIPE_READER_ID,
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

    const paymentIntent = await stripe.paymentIntents.create({
      amount: 800,
      currency: 'aud',
      payment_method_types: ['card'],
    });

    res.json({
      paymentIntentId: paymentIntent.id,
      payUrl: appendVercelBypass(`${payBaseUrl}/simulator-pay.html?pi=${paymentIntent.id}`),
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
  const validCode = process.env.PROMO_CODE?.trim().toUpperCase();

  const now = new Date();
  const validFrom = new Date(process.env.PROMO_VALID_FROM);
  const validUntil = new Date(process.env.PROMO_VALID_UNTIL);

  const codeMatches = submittedCode === validCode;
  const withinWindow = now >= validFrom && now <= validUntil;

  if (codeMatches && withinWindow) {
    return res.json({ valid: true });
  }

  if (!codeMatches) return res.json({ valid: false, reason: 'invalid_code' });
  if (now < validFrom) return res.json({ valid: false, reason: 'not_yet_active' });
  return res.json({ valid: false, reason: 'expired' });
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Mobile app: set API_BASE_URL in mobile/src/config.ts (Vercel) or BACKEND_HOST_LAN (local Wi‑Fi)');
  });
}

module.exports = app;
