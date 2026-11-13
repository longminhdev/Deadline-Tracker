import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function encryptionKey() {
  const encodedKey = process.env.ICS_ENCRYPTION_KEY?.trim();
  if (!encodedKey) throw new Error('Thiếu cấu hình mã hóa feed ICS.');
  const key = Buffer.from(encodedKey, 'base64url');
  if (key.length !== 32) throw new Error('Khóa mã hóa feed ICS không hợp lệ.');
  return key;
}

export function encryptIcsUrl(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptIcsUrl(value) {
  const [version, encodedIv, encodedTag, encodedCiphertext] = String(value || '').split('.');
  if (version !== 'v1' || !encodedIv || !encodedTag || !encodedCiphertext) {
    throw new Error('Bản ghi feed ICS không hợp lệ.');
  }
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(encodedIv, 'base64url'));
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
