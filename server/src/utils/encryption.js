const crypto = require('crypto');

/**
 * Authenticated symmetric encryption for at-rest secrets (e.g. user
 * Gemini API keys).
 *
 * v2 (current):  AES-256-GCM with a per-record PBKDF2-SHA256 key derived
 *                from the user passphrase + 16-byte random salt.
 *                Output shape:
 *                  {
 *                    v: 2,
 *                    ciphertext: base64,
 *                    iv:         base64 (12 bytes),
 *                    tag:        base64 (16 bytes, GCM auth tag),
 *                    salt:       base64 (16 bytes),
 *                    iterations: number
 *                  }
 *
 * v1 (legacy):   AES-256-CBC + HMAC-SHA256, passphrase used directly as
 *                a 32-byte key (no KDF). Still readable so existing
 *                stored ciphertext keeps working; new writes are always
 *                v2. The v1 read path uses constant-time HMAC compare.
 *                Old shape:
 *                  { encrypted, iv, tag }
 */

const CURRENT_VERSION = 2;
const KEY_LENGTH = 32; // 256 bits
const GCM_IV_LENGTH = 12;
const SALT_LENGTH = 16;
const PBKDF2_ITERATIONS = 600000; // OWASP 2023 baseline for SHA-256
const PBKDF2_DIGEST = 'sha256';

class EncryptionService {
  deriveKey(passphrase, salt, iterations = PBKDF2_ITERATIONS) {
    return crypto.pbkdf2Sync(
      String(passphrase),
      salt,
      iterations,
      KEY_LENGTH,
      PBKDF2_DIGEST
    );
  }

  /**
   * Generate a fresh random encryption key (base64, 32 bytes).
   * Used by callers that want a high-entropy passphrase to hand to the
   * client. Tests previously relied on a seeded variant — that's gone:
   * the encryption key is never deterministic.
   */
  generateKey() {
    return crypto.randomBytes(KEY_LENGTH).toString('base64');
  }

  encrypt(text, passphrase) {
    if (!text || !passphrase) {
      throw new Error('Text and passphrase are required for encryption');
    }

    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(GCM_IV_LENGTH);
    const key = this.deriveKey(passphrase, salt);

    try {
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([
        cipher.update(text, 'utf8'),
        cipher.final()
      ]);
      const tag = cipher.getAuthTag();

      return {
        v: CURRENT_VERSION,
        ciphertext: ciphertext.toString('base64'),
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        salt: salt.toString('base64'),
        iterations: PBKDF2_ITERATIONS
      };
    } finally {
      key.fill(0);
    }
  }

  decrypt(encryptedData, passphrase) {
    if (!encryptedData || !passphrase) {
      throw new Error('Encrypted data and passphrase are required');
    }

    let parsed;
    if (typeof encryptedData === 'string') {
      try {
        parsed = JSON.parse(encryptedData);
      } catch (_e) {
        throw new Error('Invalid JSON format in encrypted data');
      }
    } else if (typeof encryptedData === 'object' && encryptedData !== null) {
      parsed = encryptedData;
    } else {
      throw new Error('Invalid encrypted data type');
    }

    // Legacy entries written before v2 don't carry a version field.
    const version = parsed.v ?? parsed.version ?? 1;

    if (version === 2) {
      return this.decryptV2(parsed, passphrase);
    }
    if (version === 1) {
      return this.decryptV1(parsed, passphrase);
    }
    throw new Error(`Unsupported ciphertext version: ${version}`);
  }

  decryptV2(data, passphrase) {
    const { ciphertext, iv, tag, salt, iterations } = data;
    if (!ciphertext || !iv || !tag || !salt) {
      throw new Error('Invalid v2 ciphertext: missing field');
    }

    const ivBuf = Buffer.from(iv, 'base64');
    const tagBuf = Buffer.from(tag, 'base64');
    const saltBuf = Buffer.from(salt, 'base64');
    if (
      ivBuf.length !== GCM_IV_LENGTH ||
      saltBuf.length !== SALT_LENGTH ||
      tagBuf.length === 0
    ) {
      throw new Error('Invalid v2 ciphertext: bad field length');
    }

    const key = this.deriveKey(
      passphrase,
      saltBuf,
      iterations || PBKDF2_ITERATIONS
    );

    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuf);
      decipher.setAuthTag(tagBuf);
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64')),
        decipher.final()
      ]);
      return plaintext.toString('utf8');
    } finally {
      key.fill(0);
    }
  }

  decryptV1(data, passphrase) {
    const { encrypted, iv, tag } = data;
    if (!encrypted || !iv || !tag) {
      throw new Error('Invalid v1 ciphertext: missing field');
    }

    // v1 used the passphrase directly as a base64 32-byte key.
    const keyBuffer = Buffer.from(passphrase, 'base64');
    if (keyBuffer.length !== KEY_LENGTH) {
      throw new Error('Invalid v1 key length');
    }

    // Verify HMAC tag in constant time. v1 hashed the concatenation of
    // base64 ciphertext and base64 IV (no length encoding) — keep that
    // exact behavior so old records still validate.
    const hmac = crypto.createHmac('sha256', keyBuffer);
    hmac.update(encrypted + iv);
    const expectedTag = hmac.digest();
    const providedTag = Buffer.from(tag, 'base64');
    if (
      providedTag.length !== expectedTag.length ||
      !crypto.timingSafeEqual(providedTag, expectedTag)
    ) {
      throw new Error('Data integrity check failed');
    }

    const ivBuffer = Buffer.from(iv, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, ivBuffer);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * One-shot helper for callers who want to opportunistically upgrade
   * legacy v1 records: returns a v2 ciphertext for the same plaintext.
   * Throws if v1 decrypt fails.
   */
  upgradeLegacy(legacyData, passphrase) {
    const plaintext = this.decryptV1(legacyData, passphrase);
    return this.encrypt(plaintext, passphrase);
  }

  /**
   * Best-effort scrub of plaintext-bearing fields. Strings in JS are
   * immutable so this is mostly defence-in-depth — it nullifies the
   * reference and overwrites any string properties with random bytes.
   */
  clearSensitiveData(obj) {
    if (!obj) return;
    Object.keys(obj).forEach((key) => {
      if (typeof obj[key] === 'string') {
        obj[key] = crypto.randomBytes(obj[key].length).toString('hex');
      }
      delete obj[key];
    });
  }
}

const encryptionService = new EncryptionService();

module.exports = encryptionService;
