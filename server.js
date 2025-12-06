require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

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
        application_context: { 
          shipping_preference: 'NO_SHIPPING' // ✅ Prevent PayPal from asking shipping address
        }
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

// -----------------------------------------------------------
// Serve static pages
// -----------------------------------------------------------

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve real HTML files normally
app.get(/^\/.+\.html$/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', req.path));
});

// Fallback → index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// -----------------------------------------------------------

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
