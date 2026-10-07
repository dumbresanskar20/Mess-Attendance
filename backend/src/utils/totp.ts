import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes a buffer to a Base32 string (RFC 4648).
 */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes a Base32 string to a Buffer (RFC 4648).
 */
export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) {
      throw new Error(`Invalid base32 character: ${cleaned[i]}`);
    }

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates a random 20-byte base32 TOTP secret.
 */
export function generateTotpSecret(accountEmail = 'admin@mess.local', issuer = 'MessTokens'): {
  secret: string;
  otpauthUrl: string;
} {
  const randomBytes = crypto.randomBytes(20);
  const secret = base32Encode(randomBytes);
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(accountEmail);
  const otpauthUrl = `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;

  return { secret, otpauthUrl };
}

/**
 * Generates a 6-digit TOTP token for a given secret at a specific counter time.
 */
export function generateTotpToken(secret: string, time: number = Date.now(), stepSeconds = 30): string {
  const key = base32Decode(secret);
  const counter = Math.floor(time / 1000 / stepSeconds);

  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter), 0);

  const hmac = crypto.createHmac('sha1', key);
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  // Dynamic truncation (RFC 4226)
  const offset = digest[digest.length - 1] & 0xf;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const tokenNumber = binary % 1000000;
  return String(tokenNumber).padStart(6, '0');
}

/**
 * Verifies a 6-digit TOTP token against a secret with a window for clock drift (+/- 1 step = +/- 30s).
 */
export function verifyTotpToken(
  secret: string,
  token: string,
  window = 1,
  currentTime: number = Date.now(),
  stepSeconds = 30
): boolean {
  if (!token || token.trim().length !== 6 || !/^\d{6}$/.test(token.trim())) {
    return false;
  }

  const normalizedToken = token.trim();

  try {
    for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
      const checkTime = currentTime + errorWindow * stepSeconds * 1000;
      const expectedToken = generateTotpToken(secret, checkTime, stepSeconds);
      if (crypto.timingSafeEqual(Buffer.from(normalizedToken), Buffer.from(expectedToken))) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
