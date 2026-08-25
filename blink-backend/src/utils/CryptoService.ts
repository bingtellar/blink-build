import crypto from 'crypto';

const ENCRYPTION_KEY = Buffer.from(process.env.CLAIM_ENCRYPTION_KEY || '12345678901234567890123456789012');
const HMAC_SECRET = process.env.HMAC_SECRET || 'rotating-secret-key-1';

export const CryptoService = {
  generateSecureToken: (claimId: string, expiresAt: number) => {
    const nonce = crypto.randomBytes(12);
    const payload = JSON.stringify({ claimId, expiresAt });
    
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, nonce);
    let ciphertext = cipher.update(payload, 'utf8', 'base64url');
    ciphertext += cipher.final('base64url');
    const authTag = cipher.getAuthTag().toString('base64url');
    const nonceStr = nonce.toString('base64url');

    const encryptedData = `${nonceStr}.${ciphertext}.${authTag}`;

    const signature = crypto.createHmac('sha256', HMAC_SECRET)
      .update(encryptedData)
      .digest('base64url');

    return `${encryptedData}.${signature}`;
  },

  verifyAndDecryptToken: (token: string) => {
    try {
      const [nonceStr, ciphertext, authTagStr, signature] = token.split('.');
      const encryptedData = `${nonceStr}.${ciphertext}.${authTagStr}`;
      
      const expectedSignature = crypto.createHmac('sha256', HMAC_SECRET)
        .update(encryptedData)
        .digest('base64url');

      if (signature !== expectedSignature) return null;

      const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(nonceStr, 'base64url'));
      decipher.setAuthTag(Buffer.from(authTagStr, 'base64url'));
      
      let decrypted = decipher.update(ciphertext, 'base64url', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      return null;
    }
  },

  hashForDatabase: (token: string) => {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
};