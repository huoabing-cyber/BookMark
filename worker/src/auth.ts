// Web Crypto based auth utilities — replaces bcryptjs + jsonwebtoken.
//
// Two responsibilities:
//   1. Password hashing & verification using PBKDF2-HMAC-SHA256
//      (100,000 iterations, 16-byte salt, 32-byte derived key).
//   2. JWT HS256 sign / verify using HMAC-SHA256.
//
// Everything runs on the Web Crypto API, so no Node-only dependencies
// and no bcrypt-style native bindings — works on Cloudflare Workers,
// Deno, Bun, and the browser.

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_HASH_BYTES = 32; // 256 bits
const PBKDF2_SALT_BYTES = 16;

// ── Password hashing ─────────────────────────────────────────────────

export interface HashedPassword {
  /** Base64url of the derived key. */
  hash: string;
  /** Base64url of the random salt. */
  salt: string;
  /** Iteration count actually used (so we can evolve it later). */
  iterations: number;
}

export async function hashPassword(password: string): Promise<HashedPassword> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const derived = await derivePbkdf2(password, salt, PBKDF2_ITERATIONS);
  return {
    hash: b64urlBytes(derived),
    salt: b64urlBytes(salt),
    iterations: PBKDF2_ITERATIONS,
  };
}

export async function verifyPassword(
  password: string,
  stored: { hash: string; salt: string; iterations: number },
): Promise<boolean> {
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = b64urlDecode(stored.salt);
    expected = b64urlDecode(stored.hash);
  } catch {
    return false;
  }
  if (
    !Number.isInteger(stored.iterations) ||
    stored.iterations < 1 ||
    stored.iterations > 10_000_000
  ) {
    return false;
  }
  const computed = await derivePbkdf2(password, salt, stored.iterations);
  return timingSafeEqual(expected, computed);
}

async function derivePbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', iterations, salt },
    keyMaterial,
    PBKDF2_HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

// ── JWT (HS256) ──────────────────────────────────────────────────────

export interface JwtPayload {
  id: string;
  email: string;
  iat: number;
  exp: number;
}

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export async function signJwt(
  payload: { id: string; email: string },
  secret: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET must be set and at least 16 chars');
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const fullPayload: JwtPayload = {
    id: payload.id,
    email: payload.email,
    iat: now,
    exp: now + ttlSeconds,
  };
  const headerB64 = b64urlString(JSON.stringify(header));
  const payloadB64 = b64urlString(JSON.stringify(fullPayload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  const sigBuf = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signingInput),
  );
  const sigB64 = b64urlBytes(new Uint8Array(sigBuf));
  return `${signingInput}.${sigB64}`;
}

export async function verifyJwt(
  token: string,
  secret: string,
): Promise<JwtPayload | null> {
  if (!secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  let sig: Uint8Array;
  try {
    sig = b64urlDecode(sigB64);
  } catch {
    return null;
  }
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    sig,
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  if (!ok) return null;
  let payload: JwtPayload;
  try {
    const json = new TextDecoder().decode(b64urlDecode(payloadB64));
    payload = JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
  if (
    typeof payload.id !== 'string' ||
    typeof payload.email !== 'string' ||
    typeof payload.exp !== 'number' ||
    typeof payload.iat !== 'number'
  ) {
    return null;
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// ── Base64url + timing-safe helpers ─────────────────────────────────

function b64urlBytes(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlString(s: string): string {
  return b64urlBytes(new TextEncoder().encode(s));
}

function b64urlDecode(s: string): Uint8Array {
  const pad = (4 - (s.length % 4)) % 4;
  const padded = s + '='.repeat(pad);
  const std = padded.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(std);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}