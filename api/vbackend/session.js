/**
 * Session Management API
 * GET /api/session/claim - Claim a new session key
 * POST /api/session/heartbeat - Keep session alive
 * POST /api/session/release - Release session key
 */

import crypto from 'crypto';
import { sessions, SESSION_TIMEOUT, MAX_SESSIONS, generateFingerprint, cleanupExpiredSessions } from './session-store.js';

function generateSessionKey() {
  return crypto.randomBytes(32).toString('hex');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Key');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const path = req.url?.split('?')[0] || '';
  
  // Clean up expired sessions periodically
  cleanupExpiredSessions();
  
  // === CLAIM NEW SESSION ===
  if (path.endsWith('/claim') && req.method === 'GET') {
    try {
      // Check session limit
      if (sessions.size >= MAX_SESSIONS) {
        return res.status(429).json({
          error: 'Session limit reached',
          message: 'Too many active sessions. Try again later.'
        });
      }
      
      const fingerprint = generateFingerprint(req);
      
      // Check if this machine already has an active session
      for (const [existingKey, session] of sessions.entries()) {
        if (session.fingerprint === fingerprint && Date.now() < session.expiresAt) {
          // Reuse existing session
          console.log(`[Session] Reusing for fingerprint: ${fingerprint.substring(0, 8)}...`);
          return res.status(200).json({
            success: true,
            sessionKey: existingKey,
            expiresAt: new Date(session.expiresAt).toISOString(),
            message: 'Existing session reused'
          });
        }
      }
      
      // Create new session
      const sessionKey = generateSessionKey();
      const expiresAt = Date.now() + SESSION_TIMEOUT;
      
      sessions.set(sessionKey, {
        fingerprint,
        createdAt: Date.now(),
        expiresAt,
        lastHeartbeat: Date.now(),
        claimed: true
      });
      
      console.log(`[Session] Created: ${sessionKey.substring(0, 8)}... (${sessions.size} active)`);
      
      return res.status(200).json({
        success: true,
        sessionKey,
        expiresAt: new Date(expiresAt).toISOString(),
        heartbeatInterval: 60000, // Heartbeat every 60s
        message: 'Session created successfully'
      });
      
    } catch (error) {
      console.error('[Session] Claim error:', error);
      return res.status(500).json({ error: 'Failed to create session' });
    }
  }
  
  // === HEARTBEAT (keep session alive) ===
  if (path.endsWith('/heartbeat') && req.method === 'POST') {
    try {
      const sessionKey = req.headers['x-session-key'];
      
      if (!sessionKey) {
        return res.status(400).json({ error: 'Missing X-Session-Key header' });
      }
      
      const session = sessions.get(sessionKey);
      if (!session) {
        return res.status(404).json({ error: 'Session not found or expired' });
      }
      
      // Verify fingerprint
      const fingerprint = generateFingerprint(req);
      if (session.fingerprint !== fingerprint) {
        console.log(`[Session] Fingerprint mismatch for ${sessionKey.substring(0, 8)}...`);
        return res.status(403).json({ error: 'Session fingerprint mismatch' });
      }
      
      // Extend session
      session.lastHeartbeat = Date.now();
      session.expiresAt = Date.now() + SESSION_TIMEOUT;
      
      return res.status(200).json({
        success: true,
        expiresAt: new Date(session.expiresAt).toISOString()
      });
      
    } catch (error) {
      console.error('[Session] Heartbeat error:', error);
      return res.status(500).json({ error: 'Heartbeat failed' });
    }
  }
  
  // === RELEASE SESSION ===
  if (path.endsWith('/release') && req.method === 'POST') {
    try {
      const sessionKey = req.headers['x-session-key'];
      
      if (!sessionKey) {
        return res.status(400).json({ error: 'Missing X-Session-Key header' });
      }
      
      const session = sessions.get(sessionKey);
      if (session) {
        const fingerprint = generateFingerprint(req);
        if (session.fingerprint === fingerprint) {
          sessions.delete(sessionKey);
          console.log(`[Session] Released: ${sessionKey.substring(0, 8)}... (${sessions.size} active)`);
          return res.status(200).json({ success: true, message: 'Session released' });
        } else {
          return res.status(403).json({ error: 'Cannot release session from different machine' });
        }
      }
      
      return res.status(404).json({ error: 'Session not found' });
      
    } catch (error) {
      console.error('[Session] Release error:', error);
      return res.status(500).json({ error: 'Release failed' });
    }
  }
  
  return res.status(404).json({ error: 'Not found' });
}
