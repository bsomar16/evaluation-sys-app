/**
 * Hachage des mots de passe côté client si les RPC Supabase ne sont pas déployées.
 * Format bcrypt ($2a$…) ou PBKDF2-SHA256 ($pbkdf2-sha256$…) — jamais en clair.
 */

const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$.+/;
const PBKDF2_PREFIX = '$pbkdf2-sha256$100000$';
const PBKDF2_ITERATIONS = 100000;

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derivePbkdf2Sha256(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

export function isPasswordHashed(value: string | null | undefined): boolean {
  if (!value) return false;
  return BCRYPT_HASH_REGEX.test(value) || value.startsWith(PBKDF2_PREFIX);
}

/** Hachage client (PBKDF2) — utilisé en secours si RPC hash_password absente */
export async function hashPasswordClient(plainPassword: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePbkdf2Sha256(plainPassword, salt);
  return `${PBKDF2_PREFIX}${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPasswordClient(plainPassword: string, storedHash: string): Promise<boolean> {
  if (!storedHash) return false;
  if (storedHash.startsWith(PBKDF2_PREFIX)) {
    const rest = storedHash.slice(PBKDF2_PREFIX.length);
    const sep = rest.indexOf('$');
    if (sep < 0) return false;
    const salt = fromBase64(rest.slice(0, sep));
    const expected = fromBase64(rest.slice(sep + 1));
    const derived = await derivePbkdf2Sha256(plainPassword, salt);
    if (derived.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < derived.length; i++) diff |= derived[i]! ^ expected[i]!;
    return diff === 0;
  }
  return plainPassword === storedHash;
}
