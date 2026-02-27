/**
 * Agent token verification — Placeholder for Phase 3.
 *
 * In Phase 3, agents will authenticate to the cloud relay using
 * signed JWT tokens. This module will handle verification and generation
 * of those tokens.
 */

import { jwtVerify, SignJWT } from 'jose';
import { config } from '../config.js';
import { upsertUser } from '../db/users.js';

const hasOAuth = !!(config.github.clientId || config.google.clientId);

function encodeSecret(secret) {
  return new TextEncoder().encode(secret);
}

/**
 * Verify an agent JWT token.
 *
 * In dev/local mode (no OAuth configured), accepts the special token 'dev'
 * and auto-authenticates as a local dev agent without requiring login.
 *
 * @param {string} token - The JWT token string
 * @returns {{ agentId: string, userId: string }} Decoded agent identity
 * @throws If the token is invalid or expired
 */
export async function verifyAgentToken(token) {
  // Dev mode: no OAuth configured — accept 'dev' token without verification
  if (!hasOAuth && token === 'dev') {
    const devUser = upsertUser({
      githubId: 'dev-0',
      githubLogin: 'dev-user',
      email: 'dev@localhost',
      displayName: 'Dev User',
      avatarUrl: null,
    });
    return {
      agentId: 'agent_dev_local',
      userId: devUser.id,
    };
  }

  const secret = encodeSecret(config.jwt.agentSecret);
  const { payload } = await jwtVerify(token, secret);

  if (payload.type !== 'agent') {
    throw new Error('Invalid token type');
  }

  return {
    agentId: payload.sub,
    userId: payload.userId,
  };
}

/**
 * Generate a JWT token for an agent.
 * @param {string} userId - The owner user ID
 * @param {string} agentId - The agent ID
 * @param {string} hostname - The agent's hostname
 * @returns {Promise<string>} Signed JWT token string
 */
export async function generateAgentToken(userId, agentId, hostname) {
  const secret = encodeSecret(config.jwt.agentSecret);

  return new SignJWT({
    sub: agentId,
    userId,
    hostname,
    type: 'agent',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('365d') // Agent tokens are long-lived
    .sign(secret);
}
