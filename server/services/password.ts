import crypto from 'crypto'
import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 10
const MD5_HEX_PATTERN = /^[a-f0-9]{32}$/i

/** Legacy installs stored unsalted MD5 hashes. Detect them so they can be upgraded on use. */
export function isLegacyMd5Hash(stored: string): boolean {
  return MD5_HEX_PATTERN.test(stored || '')
}

function md5(value: string): string {
  return crypto.createHash('md5').update(value).digest('hex')
}

/** Constant-time comparison for two equal-purpose strings. */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a || '')
  const bufferB = Buffer.from(b || '')
  if (bufferA.length !== bufferB.length) return false
  return crypto.timingSafeEqual(bufferA, bufferB)
}

/** Hash a plaintext password with bcrypt for storage. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

/**
 * Verify a plaintext password against a stored hash.
 * Supports legacy unsalted MD5 hashes and signals when the stored hash should be
 * transparently upgraded to bcrypt after a successful match.
 */
export async function verifyPassword(
  plain: string,
  stored: string
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (!stored) return { valid: false, needsRehash: false }

  if (isLegacyMd5Hash(stored)) {
    const valid = safeEqual(md5(plain), stored.toLowerCase())
    return { valid, needsRehash: valid }
  }

  try {
    const valid = await bcrypt.compare(plain, stored)
    return { valid, needsRehash: false }
  } catch {
    return { valid: false, needsRehash: false }
  }
}
