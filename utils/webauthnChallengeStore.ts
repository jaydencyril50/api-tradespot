// Shared challenge store for WebAuthn flows
// Replace with Redis/DB in production for multi-instance support
const challengeStore: Record<string, string> = {};
export default challengeStore;
