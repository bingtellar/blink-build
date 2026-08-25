export class LocalCryptoUtil {
  private static ITERATIONS = 100000;
  private static KEY_LENGTH = 256;
  private static ALGORITHM = 'AES-GCM';

  private static encode(text: string): Uint8Array {
    return new TextEncoder().encode(text);
  }

  private static decode(buffer: ArrayBuffer): string {
    return new TextDecoder().decode(buffer);
  }

  private static async deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      this.encode(pin) as BufferSource, // 🌟 FIX: Added type assertion
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    return window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as BufferSource, // 🌟 FIX: Added type assertion
        iterations: this.ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: this.ALGORITHM, length: this.KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
  }

  public static async encrypt(rawPrivateKey: string, pin: string): Promise<string> {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(pin, salt);

    const encryptedBuffer = await window.crypto.subtle.encrypt(
      { name: this.ALGORITHM, iv: iv as BufferSource }, // 🌟 FIX
      key,
      this.encode(rawPrivateKey) as BufferSource // 🌟 FIX
    );

    const combinedPayload = new Uint8Array(salt.length + iv.length + encryptedBuffer.byteLength);
    combinedPayload.set(salt, 0);
    combinedPayload.set(iv, salt.length);
    combinedPayload.set(new Uint8Array(encryptedBuffer), salt.length + iv.length);

    return btoa(String.fromCharCode(...combinedPayload));
  }

  public static async decrypt(encryptedBase64: string, pin: string): Promise<string> {
    try {
      const binaryString = atob(encryptedBase64);
      const combinedPayload = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        combinedPayload[i] = binaryString.charCodeAt(i);
      }

      const salt = combinedPayload.slice(0, 16);
      const iv = combinedPayload.slice(16, 28);
      const ciphertext = combinedPayload.slice(28);

      const key = await this.deriveKey(pin, salt);

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: this.ALGORITHM, iv: iv as BufferSource }, // 🌟 FIX
        key,
        ciphertext as BufferSource // 🌟 FIX
      );

      return this.decode(decryptedBuffer);
    } catch (error) {
      throw new Error("Invalid PIN or corrupted wallet data");
    }
  }
}