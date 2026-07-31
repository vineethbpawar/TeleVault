// Cloudflare Pages Function to proxy Telegram API requests and bypass CORS.

export async function onRequest(context) {
  const { request } = context;

  // Handle CORS Preflight (OPTIONS)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  const urlObj = new URL(request.url);
  const targetUrl = urlObj.searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  // Validate the URL is to Telegram API
  if (!targetUrl.startsWith('https://api.telegram.org/')) {
    return new Response('Only telegram API requests are allowed', { status: 400 });
  }

  try {
    const fetchOptions = {
      method: request.method,
      headers: {},
    };

    // Forward content-type header if present
    const contentType = request.headers.get('content-type');
    if (contentType) {
      fetchOptions.headers['content-type'] = contentType;
    }

    if (request.method === 'POST') {
      fetchOptions.body = await request.arrayBuffer();
    }

    const telegramResponse = await fetch(targetUrl, fetchOptions);

    const responseHeaders = new Headers(telegramResponse.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');

    return new Response(telegramResponse.body, {
      status: telegramResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Telegram proxy error:', error);
    return new Response('Proxy error: ' + error.message, { status: 500 });
  }
}
