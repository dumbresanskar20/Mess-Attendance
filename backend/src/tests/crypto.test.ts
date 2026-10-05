import { describe, it, expect } from 'vitest';
import { encryptTemplate, decryptTemplate, hashPassword, comparePassword } from '../utils/crypto';

describe('Crypto & Biometric Encryption Utilities', () => {
  it('should encrypt and decrypt a fingerprint template correctly via AES-256-GCM', () => {
    const rawTemplate = 'ZKT_SAMPLE_BIOMETRIC_TEMPLATE_DATA_BINARY_XYZ_99999';
    const encrypted = encryptTemplate(rawTemplate);

    expect(encrypted.ciphertext).toBeInstanceOf(Buffer);
    expect(encrypted.iv).toHaveLength(24); // 12 bytes = 24 hex chars
    expect(encrypted.authTag).toHaveLength(32); // 16 bytes = 32 hex chars

    const decrypted = decryptTemplate(encrypted.ciphertext, encrypted.iv, encrypted.authTag);
    expect(decrypted.toString('utf-8')).toBe(rawTemplate);
  });

  it('should fail decryption if auth tag is tampered with', () => {
    const rawTemplate = 'ZKT_SAMPLE_BIOMETRIC_TEMPLATE_DATA_BINARY_XYZ_99999';
    const encrypted = encryptTemplate(rawTemplate);

    // Tamper with the authTag
    const tamperedTag = '00000000000000000000000000000000';
    expect(() => {
      decryptTemplate(encrypted.ciphertext, encrypted.iv, tamperedTag);
    }).toThrow();
  });

  it('should securely hash and verify passwords using bcrypt', async () => {
    const plain = 'Owner@123456';
    const hash = await hashPassword(plain);

    expect(hash).not.toBe(plain);
    expect(await comparePassword(plain, hash)).toBe(true);
    expect(await comparePassword('WrongPassword', hash)).toBe(false);
  });
});
