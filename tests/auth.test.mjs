import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST } from '../api/auth.mjs';
import { google, LOGIN_COOKIE, SESSION_COOKIE, sign, verify } from '../lib/auth.mjs';

const origin = 'https://koinistudio.com';
beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = '1234567890-abcdef.apps.googleusercontent.com';
  process.env.AUTH_SECRET = 'studio-test-secret-with-at-least-32-characters';
  process.env.AUTH_ORIGIN = origin;
});
const request = (action, options = {}) => new Request(`${origin}/auth/${action}`, options);
const post = (action, body, cookie = '', from = origin) => request(action, {
  method: 'POST', headers: { origin: from, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body),
});

test('unconfigured auth fails closed while session replies contain no identity', async () => {
  delete process.env.AUTH_SECRET;
  assert.equal((await GET(request('signin'))).status, 503);
  const response = await GET(request('session'));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { user: null });
});

test('sign-in issues a signed short-lived nonce and secure host-only cookie', async () => {
  const response = await GET(request('signin'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
  assert.doesNotMatch(cookie, /Domain=/i);
  const transaction = await verify(cookie.split(';')[0].split('=')[1], 'login');
  assert.ok(transaction.nonce);
  assert.match(await response.text(), new RegExp(`data-nonce="${transaction.nonce}"`));
});

test('the sign-in page renders a self-contained Continue with Google button, not a raw Google widget', async () => {
  const response = await GET(request('signin'));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /id="continue-with-google"/);
  assert.match(html, />Continue with Google</);
  assert.match(html, /class="google-g"/);
  assert.doesNotMatch(html, /Continue with GoogleContinue with Google/);
});

test('session signing rejects tampering, expiry, wrong purpose, origin and secret', async () => {
  const token = await sign({ sub: 'google-id', email: 'person@example.com' }, 'session', 60);
  assert.equal((await verify(token, 'session')).sub, 'google-id');
  const parts = token.split('.');
  parts[1] = Buffer.from(JSON.stringify({ sub: 'attacker' })).toString('base64url');
  assert.equal(await verify(parts.join('.'), 'session'), null);
  assert.equal(await verify(token, 'login'), null);
  assert.equal(await verify(await sign({}, 'session', -1), 'session'), null);
  process.env.AUTH_ORIGIN = 'https://other.example';
  assert.equal(await verify(token, 'session'), null);
  process.env.AUTH_ORIGIN = origin;
  process.env.AUTH_SECRET = 'another-studio-secret-with-at-least-32-characters';
  assert.equal(await verify(token, 'session'), null);
});

test('callback rejects cross-origin, expired state, malformed and invalid Google tokens', async t => {
  const verifier = t.mock.method(google, 'verifyIdToken', async () => { throw Error('invalid'); });
  assert.equal((await POST(post('callback', {}, '', 'https://evil.example'))).status, 403);
  assert.equal((await POST(post('callback', { credential: 'forged', nonce: 'x' }))).status, 403);
  assert.equal(verifier.mock.callCount(), 0);
  const state = await sign({ nonce: 'n' }, 'login', 600);
  const cookie = `${LOGIN_COOKIE}=${state}`;
  assert.equal((await POST(post('callback', { credential: 'forged', nonce: 'n' }, cookie))).status, 401);
  assert.equal(verifier.mock.calls[0].arguments[0].audience, process.env.GOOGLE_CLIENT_ID);
  const malformed = request('callback', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: 'null' });
  assert.equal((await POST(malformed)).status, 400);
});

test('verified Google identity creates a separate session; account escapes profile and signout clears it', async t => {
  const state = await sign({ nonce: 'n' }, 'login', 600);
  const claims = { sub: 'google-id', email: 'person@example.com', email_verified: true, name: '<img src=x onerror=alert(1)>', nonce: 'n' };
  t.mock.method(google, 'verifyIdToken', async () => ({ getPayload: () => claims }));
  const login = await POST(post('callback', { credential: 'verified-by-library', nonce: 'n' }, `${LOGIN_COOKIE}=${state}`));
  assert.equal(login.status, 200);
  const cookies = login.headers.getSetCookie();
  assert.ok(cookies.some(c => c.startsWith(`${LOGIN_COOKIE}=`) && c.includes('Max-Age=0')));
  const sessionCookie = cookies.find(c => c.startsWith(`${SESSION_COOKIE}=`)).split(';')[0];
  const identity = await GET(request('session', { headers: { cookie: sessionCookie } }));
  assert.equal((await identity.json()).user.id, 'google-id');
  const account = await GET(request('account', { headers: { cookie: sessionCookie } }));
  assert.equal(account.headers.get('referrer-policy'), 'same-origin');
  const html = await account.text();
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.equal((await GET(request('signout'))).status, 405);
  const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
  const logout = await POST(request('signout', { method: 'POST', headers: { origin, cookie: sessionCookie }, body: new URLSearchParams({ csrf }) }));
  assert.equal(logout.status, 303);
  assert.ok(logout.headers.getSetCookie().some(c => c.startsWith(`${SESSION_COOKIE}=`) && c.includes('Max-Age=0')));
});

test('Google nonce and verified-email checks reject a valid token from another transaction', async t => {
  const state = await sign({ nonce: 'n' }, 'login', 600);
  const claims = { sub: 'google-id', email: 'person@example.com', email_verified: true, nonce: 'wrong' };
  t.mock.method(google, 'verifyIdToken', async () => ({ getPayload: () => claims }));
  const callback = () => POST(post('callback', { credential: 'verified', nonce: 'n' }, `${LOGIN_COOKIE}=${state}`));
  assert.equal((await callback()).status, 401);
  claims.nonce = 'n'; claims.email_verified = false;
  assert.equal((await callback()).status, 401);
});

test('account requires a session and signout requires same-origin CSRF token', async () => {
  assert.equal((await GET(request('account'))).headers.get('location'), '/auth/signin');
  const token = await sign({ sub: 'google-id', email: 'person@example.com' }, 'session', 60);
  const cookie = `${SESSION_COOKIE}=${token}`;
  const logout = () => request('signout', { method: 'POST', headers: { origin, cookie }, body: new URLSearchParams({ csrf: 'forged' }) });
  assert.equal((await POST(logout())).status, 403);
  const duplicate = await GET(request('session', { headers: { cookie: `${cookie}; ${cookie}` } }));
  assert.deepEqual(await duplicate.json(), { user: null });
});
