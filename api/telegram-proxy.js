// Vercel Serverless Function to proxy Telegram API requests and bypass CORS.
const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { url } = req.query;
  if (!url) {
    res.status(400).send('Missing url parameter');
    return;
  }

  // Validate the URL is to telegram
  if (!url.startsWith('https://api.telegram.org/')) {
    res.status(400).send('Only telegram API requests are allowed');
    return;
  }

  try {
    const fetchOptions = {
      method: req.method,
      headers: {},
    };

    // Forward content-type if present
    if (req.headers['content-type']) {
      fetchOptions.headers['content-type'] = req.headers['content-type'];
    }

    if (req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      fetchOptions.body = Buffer.concat(chunks);
    }

    const telegramResponse = await fetch(url, fetchOptions);
    
    res.status(telegramResponse.status);
    const contentType = telegramResponse.headers.get('content-type');
    if (contentType) {
      res.setHeader('content-type', contentType);
    }

    const body = await telegramResponse.arrayBuffer();
    res.send(Buffer.from(body));
  } catch (error) {
    console.error('Telegram proxy error:', error);
    res.status(500).send('Proxy error: ' + error.message);
  }
};
