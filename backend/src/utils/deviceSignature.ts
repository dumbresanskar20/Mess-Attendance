import crypto from 'crypto';

/**
 * Normalizes body into string for HMAC calculation.
 */
export function normalizeBody(body: any): string {
  if (body === undefined || body === null) {
    return '';
  }
  if (typeof body === 'string') {
    return body;
  }
  if (typeof body === 'object') {
    return Object.keys(body).length === 0 ? '{}' : JSON.stringify(body);
  }
  return String(body);
}

/**
 * Calculates HMAC-SHA256 signature over (timestamp + body).
 */
export function calculateDeviceSignature(
  secret: string,
  timestamp: string | number,
  body: any
): string {
  const bodyStr = normalizeBody(body);
  const data = `${timestamp}${bodyStr}`;
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Performs a constant-time comparison of two hex-encoded signatures.
 */
export function timingSafeCompare(sigA: string, sigB: string): boolean {
  if (typeof sigA !== 'string' || typeof sigB !== 'string') return false;
  try {
    const bufA = Buffer.from(sigA.toLowerCase(), 'hex');
    const bufB = Buffer.from(sigB.toLowerCase(), 'hex');
    if (bufA.length === 0 || bufB.length === 0 || bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Validates whether a timestamp is within the allowed window (default: 60 seconds).
 * Returns true if valid, false if expired or invalid.
 */
export function isTimestampValid(
  timestampHeader: string | number,
  maxAgeSeconds: number = 60
): { valid: boolean; timestampMs: number } {
  let ts: number;

  if (typeof timestampHeader === 'number') {
    ts = timestampHeader > 1e11 ? timestampHeader : timestampHeader * 1000;
  } else if (typeof timestampHeader === 'string') {
    const num = Number(timestampHeader);
    if (!isNaN(num) && timestampHeader.trim() !== '') {
      ts = num > 1e11 ? num : num * 1000;
    } else {
      ts = Date.parse(timestampHeader);
    }
  } else {
    return { valid: false, timestampMs: 0 };
  }

  if (isNaN(ts)) {
    return { valid: false, timestampMs: 0 };
  }

  const now = Date.now();
  const diffMs = Math.abs(now - ts);
  const isValid = diffMs <= maxAgeSeconds * 1000;

  return { valid: isValid, timestampMs: ts };
}
