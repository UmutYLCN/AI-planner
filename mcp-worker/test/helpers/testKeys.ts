/**
 * Generates a throwaway RS256 key pair so tests can exercise the real service-account
 * JWT signing path without any Firebase project or checked-in credential.
 */
export async function generateTestPrivateKeyPem(): Promise<string> {
  const pair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;

  const pkcs8 = (await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer;
  const bytes = new Uint8Array(pkcs8);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const body = btoa(binary).replace(/(.{64})/g, '$1\n');
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`;
}

/** The same PEM as a single line with escaped newlines, as pasted from a JSON key file. */
export function toEscapedPem(pem: string): string {
  return pem.replace(/\n/g, '\\n');
}
