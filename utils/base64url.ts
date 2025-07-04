// Utility for base64url decoding (compatible with all Node.js versions)
export function base64urlToBuffer(base64url: string): Buffer {
  // Replace URL-safe chars
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  // Pad with '=' to make length a multiple of 4
  while (base64.length % 4) base64 += '=';
  return Buffer.from(base64, 'base64');
}
