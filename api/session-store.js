/**
 * Shared session store
 * Used by both session.js and vision.js
 */

import crypto from 'crypto';

// In-memory session store
export const sessions = new Map();
export const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes
export const MAX_SESSIONS = 100;

export function generateFingerprint(req) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const userAgent = req.headers['user-agent'] || '';
  return crypto.createHash('sha256').update(ip + userAgent).digest('hex');
}

export function validateSession(sessionKey, req) {
  const session = sessions.get(sessionKey);
  
  if (!session) {
    return { valid: false, reason: 'Session not found or expired' };
  }
  
  // Check expiration
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionKey);
    return { valid: false, reason: 'Session expired' };
  }
  
  // Verify fingerprint
  const fingerprint = generateFingerprint(req);
  if (session.fingerprint !== fingerprint) {
    return { valid: false, reason: 'Session fingerprint mismatch' };
  }
  
  return { valid: true };
}

export function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [key, session] of sessions.entries()) {
    if (now > session.expiresAt) {
      sessions.delete(key);
    }
  }
}
