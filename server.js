require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fetch = require('node-fetch');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));
// Redirect Render URL to the custom domain
app.use((req, res, next) => {
  const host = req.get('host');

  if (host && host.includes('deepdarshansangeethavidhyalaya.onrender.com')) {
    return res.redirect(301, `https://deepdarshansangeethavidhyalayam.com${req.originalUrl}`);
  }

  next();
});

// ----------------- PhonePe Payment -----------------
app.get('/create-phonepe-payment', async (req, res) => {
  const { amount } = req.query;

  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  const merchantId = process.env.PHONEPE_MERCHANT_ID;
  const merchantTransactionId = `txn_${Date.now()}`;
  const redirectUrl = process.env.PHONEPE_REDIRECT_URL;

  const payload = {
    merchantId,
    merchantTransactionId,
    amount: parseInt(amount) * 100, // paise
    redirectUrl
  };

  // Create PhonePe signature
  const dataString = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', process.env.PHONEPE_SECRET_KEY)
                        .update(JSON.stringify(payload))
                        .digest('hex');


  try {
    // Sandbox URL: use live URL for production
  const response = await fetch('https://api-preprod.phonepe.com/apis/hermes/pg/v1/payment/request', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-VERIFY': signature
  },
  body: dataString
});


    const data = await response.json();
    if (data.success && data.data && data.data.paymentUrl) {
      res.json({ url: data.data.paymentUrl });
    } else {
      console.error("PhonePe API Error:", data);
      res.status(500).json({ error: "PhonePe API error", details: data });
    }

  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ----------------- PhonePe Callback -----------------
app.post('/phonepe-callback', async (req, res) => {
  const body = req.body;

  // TODO: verify signature here for live use
  console.log("PhonePe Callback Data:", body);
  res.sendStatus(200); // acknowledge
});

// ----------------- PayPal Integration -----------------
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

// ----------------- Serve static pages -----------------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get(/^\/.+\.html$/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', req.path));
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ----------------- Start Server -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
