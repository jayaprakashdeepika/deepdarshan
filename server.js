require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// ✅ Razorpay setup (safe to skip if keys not added yet)
let razorpay;
try {
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_SECRET) {
    const Razorpay = require('razorpay');
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_SECRET
    });
    console.log("✅ Razorpay initialized");
  } else {
    console.warn("⚠️ Razorpay keys not found — skipping Razorpay setup");
  }
} catch (err) {
  console.warn("⚠️ Razorpay not initialized:", err.message);
}

// ✅ Razorpay order creation (user chooses amount)
app.post('/create-razorpay-order', async (req, res) => {
  if (!razorpay) {
    return res.status(400).json({ error: 'Razorpay not configured yet. Please add keys.' });
  }

  try {
    const { amount } = req.body;
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Please provide a valid amount in INR.' });
    }

    const options = {
      amount: Math.round(amount * 100), // ₹ → paise
      currency: 'INR',
      receipt: `deepdarshan_donation_${Date.now()}`,
      notes: { purpose: 'Donation to Deepdarshan Sangeetha Vidhyalayam' }
    };

    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (err) {
    console.error('❌ Error creating Razorpay order:', err);
    res.status(500).json({ error: 'Razorpay order creation failed' });
  }
});

// ✅ PayPal order creation (user chooses amount)
app.post('/create-paypal-order', async (req, res) => {
  const { amount } = req.body;

  try {
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Please provide a valid amount in USD.' });
    }

    const accessToken = await generateAccessToken();

    const response = await fetch('https://api-m.paypal.com/v2/checkout/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: 'USD',
              value: amount.toString()
            },
            description: 'Donation to Deepdarshan Sangeetha Vidhyalayam'
          }
        ],
        application_context: { shipping_preference: 'NO_SHIPPING' }
      })
    });

    const data = await response.json();
    console.log('✅ PayPal create-order response:', data);

    if (data.id) {
      res.json({ orderID: data.id });
    } else {
      console.error('❌ PayPal error:', data);
      res.status(400).json({ error: 'Failed to create PayPal order', details: data });
    }
  } catch (err) {
    console.error('❌ Error creating PayPal order:', err);
    res.status(500).json({ error: 'Server error creating PayPal order' });
  }
});

// ✅ Capture PayPal payment
app.post('/capture-order', async (req, res) => {
  const { orderID } = req.body;
  try {
    const accessToken = await generateAccessToken();

    const response = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const data = await response.json();
    console.log('✅ PayPal capture response:', data);
    res.json(data);
  } catch (err) {
    console.error('❌ Error capturing PayPal order:', err);
    res.status(500).json({ error: 'Server error capturing PayPal order' });
  }
});

// ✅ Function to get PayPal access token
async function generateAccessToken() {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString('base64');
  const response = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  const data = await response.json();
  return data.access_token;
}

// ✅ Root route
app.get('/', (req, res) => {
  res.send('🎵 Deepdarshan backend (PayPal + Razorpay with custom amounts) is running!');
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
