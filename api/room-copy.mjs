const headers = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
};

function page(content) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>A room shared with you — Koini Studio</title><link rel="icon" href="/assets/favicon.png"><link rel="stylesheet" href="/room-copy.css"><script src="/room-copy.js" defer></script></head><body><header><a href="https://koinistudio.com">koini <span>studio</span></a></header><main>${content}</main></body></html>`;
}

export async function GET(request) {
  const url = new URL(request.url);
  const values = url.searchParams.getAll('token');
  const token = values[0];
  if (values.length !== 1 || !/^[0-9a-f]{32}$/.test(token ?? '')) {
    return new Response(page('<h1>This link could not be read.</h1><p>Ask the sender for a new room link.</p>'), { status: 404, headers });
  }
  let status;
  try {
    const response = await fetch(`https://koini-api.onrender.com/room-copy/${token}`, {
      method: 'HEAD', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000),
    });
    status = response.status;
  } catch {
    console.error('room_link_availability_check_failed');
    return new Response(page('<h1>Please try again.</h1><p>We could not check this room link. Refresh the page in a moment.</p>'), { status: 503, headers });
  }
  if (status === 404 || status === 410) {
    return new Response(page('<h1>This room link is no longer available.</h1><p>It has expired or the sender has stopped it. Ask them for a new link.</p>'), { status: 410, headers });
  }
  if (status !== 200) {
    console.error('room_link_availability_check_failed', { status });
    return new Response(page('<h1>Please try again.</h1><p>We could not check this room link. Refresh the page in a moment.</p>'), { status: 503, headers });
  }
  const canonical = `https://koinistudio.com/room-copy/${token}`;
  const openingHost = url.hostname === 'open.koinistudio.com' ? 'koinistudio.com' : 'open.koinistudio.com';
  const content = `<p class="eyebrow">A different point of view</p><h1>A room<br>shared with you.</h1><p>Open Koini to save your own editable copy, with its furniture, finishes and lighting.</p><a class="primary" href="https://${openingHost}/room-copy/${token}" id="open-room">Open room in Koini <span aria-hidden="true">↗</span></a><p class="small">You need an updated Koini TestFlight build with room sharing.</p><section class="help" aria-labelledby="help-heading"><h2 id="help-heading">Opening from Snapchat?</h2><p id="browser-help">Snapchat and some other apps keep links in their own browser. If Koini does not open, use that browser’s menu to open this page in Safari, then tap the button again.</p><p>In Safari, you can also <a href="koini://room-copy/${token}">use the direct app link</a>.</p><label for="room-link">Or copy this link and open it in Safari</label><div class="copy-row"><input id="room-link" value="${canonical}" readonly><button type="button" id="copy-link">Copy link</button></div><p id="copy-status" class="small" role="status" aria-live="polite"></p></section><p class="small">Your copy is independent. Editing it will not change the sender’s room.</p>`;
  return new Response(page(content), { status: 200, headers });
}
