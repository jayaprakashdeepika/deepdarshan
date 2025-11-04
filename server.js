require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// ✅ Simple root route
app.get('/', (req, res) => {
  res.send('Flute Gurukulam backend (PayPal ready) is running 🎶');
});

// ✅ PayPal order creation
app.post('/create-order', async (req, res) => {
  const { amount, currency } = req.body;

  try {
    const accessToken = await generateAccessToken();

    const response = await fetch('https://api-m.paypal.com/v2/checkout/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: currency || 'USD',
            value: amount || '5.00'
          },
          description: "Donation to Deepdarshan Sangeetha Vidhyalayam"
        }],
        application_context: {
          shipping_preference: 'NO_SHIPPING'
        }
      })
    });

    const data = await response.json();
    console.log('PayPal create-order response:', data);

    if (data.id) {
      res.json({ orderID: data.id });
    } else {
      console.error('PayPal error:', data);
      res.status(400).json({ error: 'Failed to create PayPal order', details: data });
    }
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ error: 'Server error creating PayPal order' });
  }
});

// ✅ Capture the payment
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
    console.log('PayPal capture response:', data);
    res.json(data);
  } catch (err) {
    console.error('Error capturing order:', err);
    res.status(500).json({ error: 'Server error capturing order' });
  }
});

// ✅ Function to get access token
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
