import { cookie, escapeHtml, google, LOGIN_COOKIE, randomToken, session, SESSION_AGE, SESSION_COOKIE, setCookie, settings, sign, verify } from '../lib/auth.mjs';

const headers = {
  'Cache-Control': 'no-store',
  // Google Identity Services needs the page origin as Referer on its cross-origin
  // button/iframe requests; same-origin or no-referrer makes Google reject the client ID.
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  // Google Identity Services injects an inline <style> element and inline style attributes
  // when it renders the button, so style-src must allow inline styles (scripts stay strict).
  'Content-Security-Policy': "default-src 'none'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; frame-src https://accounts.google.com/gsi/; connect-src 'self' https://accounts.google.com/gsi/; img-src 'self' https://*.googleusercontent.com; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};

function page(content, { status = 200, cookies = [] } = {}) {
  const h = new Headers({ ...headers, 'Content-Type': 'text/html; charset=utf-8' });
  for (const value of cookies) h.append('Set-Cookie', value);
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Your account — Koini Studio</title><link rel="icon" href="/assets/favicon.svg"><link rel="stylesheet" href="/room-copy.css"><link rel="stylesheet" href="/auth.css"><script src="/auth.js" defer></script></head><body><header><a href="/">koini <span>studio</span></a></header><main>${content}</main></body></html>`, { status, headers: h });
}

const json = (body, status = 200, cookies = []) => {
  const h = new Headers({ ...headers, 'Content-Type': 'application/json' });
  for (const value of cookies) h.append('Set-Cookie', value);
  return new Response(JSON.stringify(body), { status, headers: h });
};

const redirect = path => new Response(null, { status: 303, headers: { ...headers, Location: path } });

export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}

async function handle(request) {
  const url = new URL(request.url);
  const actions = url.searchParams.getAll('action');
  const action = actions.length ? (actions.length === 1 ? actions[0] : '') : url.pathname.split('/').pop();
  if (!['signin', 'session', 'callback', 'account', 'signout'].includes(action)) return json({ error: 'Not found.' }, 404);
  const method = ['callback', 'signout'].includes(action) ? 'POST' : 'GET';
  if (request.method !== method) return new Response(null, { status: 405, headers: { ...headers, Allow: method } });
  let config;
  try { config = settings(); } catch {
    return action === 'session' ? json({ user: null }, 503) : page('<h1>Sign-in is unavailable.</h1><p>Please try again in a moment.</p><a href="/">Back to Koini Studio</a>', { status: 503 });
  }
  if (url.origin !== config.origin) return redirect(`${config.origin}/auth/${action === 'session' ? 'signin' : action}`);
  if (method === 'POST' && request.headers.get('origin') !== config.origin) return json({ error: 'Please start again from Koini Studio.' }, 403);

  if (action === 'session') return json({ user: await session(request) });

  if (action === 'signin') {
    if (await session(request)) return redirect('/auth/account');
    const nonce = randomToken();
    const token = await sign({ nonce }, 'login', 600);
    return page(`<p class="eyebrow">A space that’s yours</p><h1>Welcome to<br>Koini Studio.</h1><p>Sign in with your Google account.</p><div id="google-signin" data-client-id="${escapeHtml(config.clientId)}" data-nonce="${nonce}"></div><p id="auth-status" class="small" role="status" aria-live="polite">Loading Google sign-in…</p><noscript><p>Enable JavaScript to sign in with Google.</p></noscript><p class="small">By signing in, you share your name and email address with Koini Studio. <a href="/privacy">Privacy policy</a></p><p class="small"><a href="/">Keep exploring Koini</a></p>`, { cookies: [setCookie(LOGIN_COOKIE, token, 600)] });
  }

  if (action === 'account') {
    const user = await session(request);
    if (!user) return redirect('/auth/signin');
    const csrf = await sign({ sub: user.id }, 'signout', 3600);
    return page(`<p class="eyebrow">Your account</p><h1>You’re signed in.</h1><p>${escapeHtml(user.name || user.email)}</p><p class="small">${escapeHtml(user.email)}</p><p>Find a fresh perspective on your space. Explore furniture and finishes here, and create your room plans in the Koini iPhone app.</p><a class="primary" href="/">Explore Koini <span aria-hidden="true">↗</span></a><form method="post" action="/auth/signout"><input type="hidden" name="csrf" value="${csrf}"><button type="submit">Sign out</button></form>`);
  }

  if (action === 'signout') {
    const user = await session(request);
    const form = await request.formData().catch(() => null);
    const csrf = await verify(form?.get('csrf'), 'signout');
    if (!user || csrf?.sub !== user.id) return json({ error: 'Please refresh your account page and try again.' }, 403);
    const response = redirect('/');
    response.headers.append('Set-Cookie', setCookie(SESSION_COOKIE, '', 0));
    response.headers.append('Set-Cookie', setCookie(LOGIN_COOKIE, '', 0));
    return response;
  }

  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Expected JSON.' }, 415);
  if (Number(request.headers.get('content-length')) > 20000) return json({ error: 'Request too large.' }, 413);
  const body = await request.text();
  if (body.length > 20000) return json({ error: 'Request too large.' }, 413);
  let credential, nonce;
  try { ({ credential, nonce } = JSON.parse(body)); } catch { return json({ error: 'Invalid request.' }, 400); }
  const login = await verify(cookie(request, LOGIN_COOKIE), 'login');
  if (!login || typeof nonce !== 'string' || nonce !== login.nonce) return json({ error: 'Your sign-in expired. Refresh this page and try again.' }, 403);
  if (typeof credential !== 'string' || credential.length > 16000) return json({ error: 'Missing Google credential.' }, 400);
  let claims;
  try {
    const ticket = await google.verifyIdToken({ idToken: credential, audience: config.clientId });
    claims = ticket.getPayload();
  } catch { return json({ error: 'Google could not confirm your sign-in. Please try again.' }, 401); }
  if (!claims?.sub || !claims.email || claims.email_verified !== true || claims.nonce !== login.nonce) {
    return json({ error: 'Google could not confirm your sign-in. Refresh this page and try again.' }, 401);
  }
  const token = await sign({ sub: claims.sub, email: claims.email, name: claims.name || '' }, 'session', SESSION_AGE);
  return json({ redirect: '/auth/account' }, 200, [setCookie(SESSION_COOKIE, token, SESSION_AGE), setCookie(LOGIN_COOKIE, '', 0)]);
}
