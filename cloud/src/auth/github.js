import { GitHub } from 'arctic';
import { SignJWT } from 'jose';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { upsertUser } from '../db/users.js';
import { recordEvent } from '../db/events.js';

// Lazily initialize the GitHub OAuth client — only when credentials are present
let github = null;

function getGitHub() {
  if (!github && config.github.clientId && config.github.clientSecret) {
    github = new GitHub(
      config.github.clientId,
      config.github.clientSecret,
      config.github.callbackUrl
    );
  }
  return github;
}

/**
 * Encode the JWT secret string into a Uint8Array for jose.
 */
function getSecretKey() {
  return new TextEncoder().encode(config.jwt.secret);
}

/**
 * Issue a short-lived access JWT for the given user.
 */
async function issueAccessToken(user) {
  return new SignJWT({
    sub: user.id,
    github_login: user.github_login,
    tier: user.tier,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.jwt.userTtl)
    .setJti(nanoid())
    .sign(getSecretKey());
}

/**
 * Issue a long-lived refresh JWT for the given user.
 */
async function issueRefreshToken(user) {
  return new SignJWT({
    sub: user.id,
    type: 'refresh',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.jwt.refreshTtl)
    .setJti(nanoid())
    .sign(getSecretKey());
}

/**
 * Set JWT cookies on the response.
 */
function setAuthCookies(res, accessToken, refreshToken) {
  const isProduction = config.nodeEnv === 'production';
  const cookieOpts = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  };

  res.cookie('tc_access', accessToken, {
    ...cookieOpts,
    maxAge: 60 * 60 * 1000, // 1 hour
  });

  res.cookie('tc_refresh', refreshToken, {
    ...cookieOpts,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

/**
 * Clear auth cookies.
 */
function clearAuthCookies(res) {
  res.clearCookie('tc_access', { path: '/' });
  res.clearCookie('tc_refresh', { path: '/' });
}

/**
 * Register GitHub OAuth routes on the Express app.
 */
export function setupGitHubAuth(app) {
  // GET /auth/github — redirect to GitHub OAuth
  app.get('/auth/github', (req, res) => {
    const gh = getGitHub();
    if (!gh) {
      return res.status(503).json({
        error: 'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.',
      });
    }

    const state = nanoid();

    // Store state in a short-lived cookie for CSRF verification
    res.cookie('oauth_state', state, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000, // 10 minutes
      path: '/',
    });

    const url = gh.createAuthorizationURL(state, ['read:user', 'user:email']);
    res.redirect(url.toString());
  });

  // GET /auth/github/callback — handle OAuth callback
  app.get('/auth/github/callback', async (req, res) => {
    try {
      const { code, state } = req.query;
      const storedState = req.cookies?.oauth_state;

      // Validate state for CSRF protection
      if (!state || !storedState || state !== storedState) {
        console.error('[auth] OAuth state mismatch');
        return res.status(403).send('Invalid OAuth state. Please try again.');
      }

      // Clear the state cookie
      res.clearCookie('oauth_state', { path: '/' });

      if (!code) {
        return res.status(400).send('Missing authorization code.');
      }

      const gh = getGitHub();
      if (!gh) {
        return res.status(503).send('GitHub OAuth not configured.');
      }

      // Exchange code for access token
      const tokens = await gh.validateAuthorizationCode(code);
      const accessToken = tokens.accessToken();

      // Fetch user profile from GitHub API
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!userResponse.ok) {
        console.error('[auth] Failed to fetch GitHub user:', userResponse.status);
        return res.status(500).send('Failed to fetch user profile from GitHub.');
      }

      const ghUser = await userResponse.json();

      // Fetch user emails if primary email not in profile
      let email = ghUser.email;
      if (!email) {
        try {
          const emailsResponse = await fetch('https://api.github.com/user/emails', {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/vnd.github.v3+json',
            },
          });
          if (emailsResponse.ok) {
            const emails = await emailsResponse.json();
            const primary = emails.find(e => e.primary && e.verified);
            if (primary) email = primary.email;
          }
        } catch (err) {
          console.warn('[auth] Could not fetch user emails:', err.message);
        }
      }

      // Read UTM attribution cookie (set by analytics.js before OAuth redirect)
      const utmSource = req.cookies?._49a_utm || null;

      // Upsert user in database
      const user = upsertUser({
        githubId: ghUser.id,
        githubLogin: ghUser.login,
        email: email || null,
        displayName: ghUser.name || ghUser.login,
        avatarUrl: ghUser.avatar_url || null,
        utmSource,
      });

      // Clear the UTM cookie after use
      if (utmSource) res.clearCookie('_49a_utm', { path: '/' });

      console.log(`[auth] User authenticated: ${user.github_login} (${user.id})`);
      recordEvent('user.login', user.id, { provider: 'github', login: user.github_login });

      // Issue JWTs
      const jwtAccess = await issueAccessToken(user);
      const jwtRefresh = await issueRefreshToken(user);

      // Set cookies
      setAuthCookies(res, jwtAccess, jwtRefresh);

      // Redirect to the main app
      res.redirect('/');
    } catch (err) {
      console.error('[auth] OAuth callback error:', err);
      res.status(500).send('Authentication failed. Please try again.');
    }
  });

  // POST /auth/logout — clear cookies and redirect
  app.post('/auth/logout', (req, res) => {
    clearAuthCookies(res);
    res.redirect('/login');
  });

  // Also support GET for convenience (e.g., link-based logout)
  app.get('/auth/logout', (req, res) => {
    clearAuthCookies(res);
    res.redirect('/login');
  });
}

// Export helpers for use in middleware and other auth providers
export { issueAccessToken, issueRefreshToken, setAuthCookies, getSecretKey };
