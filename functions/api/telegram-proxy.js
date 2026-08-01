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
  let targetUrl = urlObj.searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  // Handle double-encoded or decoded URLs
  try {
    if (targetUrl.includes('%3A') || targetUrl.includes('%2F')) {
      targetUrl = decodeURIComponent(targetUrl);
    }
  } catch (_) {}

  // If path was passed relatively, prepend Telegram base URL
  if (targetUrl.startsWith('/file/bot') || targetUrl.startsWith('file/bot') || targetUrl.startsWith('/bot')) {
    const cleanPath = targetUrl.startsWith('/') ? targetUrl : '/' + targetUrl;
    targetUrl = `https://api.telegram.org${cleanPath}`;
  }

  // Validate the URL is to Telegram API
  if (!targetUrl.startsWith('https://api.telegram.org/')) {
    return new Response(`Only telegram API requests are allowed (got: ${targetUrl.slice(0, 50)})`, { status: 400 });
  }

  try {
    const fetchOptions = {
      method: request.method,
      headers: {},
    };

    // Forward content-type & range headers for iOS Safari HTTP byte-range video streaming
    const contentType = request.headers.get('content-type');
    if (contentType) {
      fetchOptions.headers['content-type'] = contentType;
    }
    const range = request.headers.get('range');
    if (range) {
      fetchOptions.headers['range'] = range;
    }

    if (request.method === 'POST') {
      fetchOptions.body = await request.arrayBuffer();
    }

    const telegramResponse = await fetch(targetUrl, fetchOptions);

    const responseHeaders = new Headers(telegramResponse.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    if (!responseHeaders.has('Accept-Ranges')) {
      responseHeaders.set('Accept-Ranges', 'bytes');
    }

    return new Response(telegramResponse.body, {
      status: telegramResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Telegram proxy error:', error);
    return new Response('Proxy error: ' + error.message, { status: 500 });
  }
}
