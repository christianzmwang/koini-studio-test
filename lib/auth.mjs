import { randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { OAuth2Client } from 'google-auth-library';

export const SESSION_COOKIE = 'koini_studio_session';
export const LOGIN_COOKIE = 'koini_studio_login';
export const SESSION_AGE = 7 * 86400;
export const google = new OAuth2Client();

export function settings() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.AUTH_SECRET?.trim();
  const origin = new URL(process.env.AUTH_ORIGIN || 'https://koini-studio-test.vercel.app').origin;
  if (!/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId || '') || !secret || secret.length < 32) {
    throw new Error('auth_not_configured');
  }
  return { clientId, origin, key: new TextEncoder().encode(secret) };
}

export const randomToken = () => randomBytes(32).toString('base64url');

export function cookie(request, name) {
  const values = (request.headers.get('cookie') || '').split(';').map(s => s.trim()).filter(s => s.startsWith(`${name}=`));
  return values.length === 1 ? values[0].slice(name.length + 1) : undefined;
}

export function setCookie(name, value, maxAge) {
  const secure = settings().origin.startsWith('https:') ? '; Secure' : '';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function sign(payload, purpose, age) {
  const { key, origin } = settings();
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer('koini-studio').setAudience(`${origin}/${purpose}`).setIssuedAt().setExpirationTime(`${age}s`).sign(key);
}

export async function verify(token, purpose) {
  if (!token) return null;
  try {
    const { key, origin } = settings();
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'], issuer: 'koini-studio', audience: `${origin}/${purpose}` });
    return payload;
  } catch { return null; }
}

export async function session(request) {
  const payload = await verify(cookie(request, SESSION_COOKIE), 'session');
  if (typeof payload?.sub !== 'string' || typeof payload.email !== 'string') return null;
  return { id: payload.sub, email: payload.email, name: typeof payload.name === 'string' ? payload.name : '' };
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
