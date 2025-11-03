/**
 * Groq Vision API Endpoint
 * POST /api/neuro-os/vision
 * Analyzes screenshots using Groq's Llama Vision model
 */

import Groq from 'groq-sdk';
import crypto from 'crypto';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Import session store (shared with session.js)
import { validateSession } from './session-store.js';

// Security: Session key validation
function validateSessionKey(req) {
  const sessionKey = req.headers['x-session-key'];
  
  if (!sessionKey) {
    return { valid: false, reason: 'Missing session key' };
  }
  
  return validateSession(sessionKey, req);
}

// Rate limiting (simple in-memory, use Redis in production)
const rateLimitMap = new Map();
const RATE_LIMIT = 10; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(identifier) {
  const now = Date.now();
  const userLimits = rateLimitMap.get(identifier) || { count: 0, resetAt: now + RATE_WINDOW };
  
  if (now > userLimits.resetAt) {
    userLimits.count = 0;
    userLimits.resetAt = now + RATE_WINDOW;
  }
  
  if (userLimits.count >= RATE_LIMIT) {
    return false;
  }
  
  userLimits.count++;
  rateLimitMap.set(identifier, userLimits);
  return true;
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Validate session key
  const sessionValidation = validateSessionKey(req);
  if (!sessionValidation.valid) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: sessionValidation.reason || 'Invalid session key'
    });
  }
  
  // Rate limiting
  const clientId = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientId)) {
    return res.status(429).json({ error: 'Rate limit exceeded - max 10 requests per minute' });
  }
  
  try {
    const { image, prompt, model } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: 'Missing required field: image (base64 or URL)' });
    }
    
    // Default prompt for screen analysis
    const analysisPrompt = prompt || `Analyze this screenshot and describe:
1. What application or website is shown
2. All visible UI elements (buttons, text, links, inputs) with their approximate positions
3. Main content and purpose
4. Any interactive elements the user could click on
Be specific about locations (top-left, center, bottom-right, etc.)`;
    
    // Call Groq Vision API
    const completion = await groq.chat.completions.create({
      model: model || 'llama-3.2-90b-vision-preview',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: analysisPrompt
            },
            {
              type: 'image_url',
              image_url: {
                url: image.startsWith('data:') ? image : `data:image/png;base64,${image}`
              }
            }
          ]
        }
      ],
      temperature: 0.3,
      max_tokens: 1024,
      top_p: 1,
      stream: false
    });
    
    const analysis = completion.choices[0]?.message?.content || 'No analysis generated';
    
    return res.status(200).json({
      success: true,
      analysis,
      model: completion.model,
      usage: completion.usage,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Vision API error:', error);
    
    if (error.status === 401) {
      return res.status(500).json({ error: 'Invalid Groq API key' });
    }
    
    return res.status(500).json({
      error: 'Vision analysis failed',
      details: error.message
    });
  }
}
