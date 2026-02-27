import { jwtVerify } from 'jose';
import { issueAccessToken, getSecretKey } from './github.js';
import { getUserById } from '../db/users.js';
import { upsertUser } from '../db/users.js';
import { config } from '../config.js';

const hasOAuth = !!(config.github.clientId || config.google.clientId);

/**
 * Express middleware that requires a valid JWT.
 *
 * When no OAuth provider is configured (local/dev mode), all requests are
 * automatically authenticated as a dev user — no login required.
 *
 * When OAuth is configured (production), the standard JWT cookie flow applies:
 * 1. Extract access token from tc_access cookie
 * 2. Verify it — if valid, attach user to req.user
 * 3. If expired, try the refresh token (tc_refresh cookie)
 *    - If refresh valid: issue new access token, set cookie, continue
 *    - If refresh also invalid: 401
 * 4. If no token at all: 401 or redirect to /login for HTML requests
 */
export function requireAuth(req, res, next) {
  handleAuth(req, res, next).catch((err) => {
    console.error('[auth] Middleware error:', err);
    return sendUnauthorized(req, res);
  });
}

async function handleAuth(req, res, next) {
  // Dev/local mode: no OAuth configured — auto-authenticate as dev user
  if (!hasOAuth) {
    const devUser = upsertUser({
      githubId: 'dev-0',
      githubLogin: 'dev-user',
      email: 'dev@localhost',
      displayName: 'Dev User',
      avatarUrl: null,
    });
    req.user = devUser;
    return next();
  }

  const accessToken = req.cookies?.tc_access;
  const refreshToken = req.cookies?.tc_refresh;
  const secretKey = getSecretKey();

  // Try access token first
  if (accessToken) {
    try {
      const { payload } = await jwtVerify(accessToken, secretKey);
      const user = getUserById(payload.sub);
      if (user) {
        req.user = user;
        return next();
      }
    } catch (err) {
      // Access token invalid or expired — fall through to refresh
      if (err.code !== 'ERR_JWT_EXPIRED') {
        // Token is malformed or tampered — don't try refresh
        return sendUnauthorized(req, res);
      }
    }
  }

  // Try refresh token
  if (refreshToken) {
    try {
      const { payload } = await jwtVerify(refreshToken, secretKey);

      if (payload.type !== 'refresh') {
        return sendUnauthorized(req, res);
      }

      const user = getUserById(payload.sub);
      if (!user) {
        return sendUnauthorized(req, res);
      }

      // Issue a new access token
      const newAccessToken = await issueAccessToken(user);

      const isProduction = config.nodeEnv === 'production';
      res.cookie('tc_access', newAccessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 1000, // 1 hour
      });

      req.user = user;
      return next();
    } catch (err) {
      // Refresh token also invalid/expired
      return sendUnauthorized(req, res);
    }
  }

  // No tokens at all
  return sendUnauthorized(req, res);
}

/**
 * Send a 401 or redirect to /login depending on the request type.
 */
function sendUnauthorized(req, res) {
  // For API/JSON requests, return 401
  if (
    req.path.startsWith('/api/') ||
    req.path.startsWith('/auth/') ||
    req.xhr ||
    req.headers.accept?.includes('application/json')
  ) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Please log in.' });
  }

  // For browser/HTML requests, redirect to login
  return res.redirect('/login');
}
