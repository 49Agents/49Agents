import { createServer } from 'http';
import { spawnSync } from 'child_process';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { initDatabase } from './db/index.js';
import { setupGitHubAuth } from './auth/github.js';
import { setupGoogleAuth } from './auth/google.js';
import { requireAuth } from './auth/middleware.js';
import { setupApiRoutes } from './routes/api.js';
import { setupLayoutRoutes } from './routes/layouts.js';
import { setupBillingRoutes, handleStripeWebhook } from './billing/stripe.js';
import { setupDownloadRoutes } from './routes/download.js';
import { setupPreferencesRoutes } from './routes/preferences.js';
import { setupFeedbackRoutes, setChatBrowsers } from './routes/feedback.js';
import { setupAnalyticsRoutes } from './routes/analytics.js';
import { setupWebSocketRelay } from './ws/relay.js';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '..', 'public');
const landingDir = config.landingDir ? resolve(config.landingDir) : null;

const app = express();

// ---------------------------------------------------------------------------
// Landing page routing (hostname-based)
// If APP_HOST is set, requests to the root domain serve the landing page
// and only APP_HOST gets the actual app.
// ---------------------------------------------------------------------------
if (landingDir && config.appHost) {
  app.use((req, res, next) => {
    const host = req.hostname;
    // If this is the app subdomain, continue to the app
    if (host === config.appHost) return next();
    // Otherwise serve the landing page
    if (req.path === '/' || req.path === '/index.html') {
      return res.sendFile('index.html', { root: landingDir });
    }
    // Try to serve static assets from landing dir, fall through if not found
    express.static(landingDir)(req, res, next);
  });
}

// ---------------------------------------------------------------------------
// Security middleware
// ---------------------------------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: false, // CSP configured separately if needed
    crossOriginEmbedderPolicy: false, // Allow embedding iframes in the canvas
  })
);

const allowedOrigins = config.nodeEnv === 'production'
  ? [`https://${config.cloudHost}`, ...(config.appHost ? [`https://${config.appHost}`] : [])]
  : true;

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(cookieParser());

// Stripe webhook needs raw body for signature verification — must come BEFORE express.json()
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), handleStripeWebhook);

app.use(express.json({ limit: '16kb' }));

// ---------------------------------------------------------------------------
// Agent download routes (public -- no requireAuth)
// ---------------------------------------------------------------------------
setupDownloadRoutes(app);

// ---------------------------------------------------------------------------
// Auth routes (public -- no requireAuth)
// ---------------------------------------------------------------------------
setupGitHubAuth(app);
setupGoogleAuth(app);

// ---------------------------------------------------------------------------
// Login page (public)
// ---------------------------------------------------------------------------
app.get('/login', (req, res) => {
  res.sendFile('login.html', { root: publicDir });
});

// ---------------------------------------------------------------------------
// API routes (protected -- requireAuth is applied inside setupApiRoutes)
// ---------------------------------------------------------------------------
setupApiRoutes(app);

// ---------------------------------------------------------------------------
// Layout persistence routes (cloud-direct, not relayed through agents)
// ---------------------------------------------------------------------------
setupLayoutRoutes(app);

// ---------------------------------------------------------------------------
// User preferences routes (cloud-direct)
// ---------------------------------------------------------------------------
setupPreferencesRoutes(app);

// ---------------------------------------------------------------------------
// Feedback routes (webhook forwarding)
// ---------------------------------------------------------------------------
setupFeedbackRoutes(app);

// ---------------------------------------------------------------------------
// Billing routes (checkout, portal, status)
// ---------------------------------------------------------------------------
setupBillingRoutes(app);

// ---------------------------------------------------------------------------
// Analytics routes (public tracking only — admin routes on Tailscale server)
// ---------------------------------------------------------------------------
setupAnalyticsRoutes(app);

// ---------------------------------------------------------------------------
// Main app entry point (skip auth in dev mode)
// ---------------------------------------------------------------------------
const hasOAuth = config.github.clientId || config.google.clientId;
if (!hasOAuth) {
  app.get('/', (req, res) => res.sendFile('index.html', { root: publicDir }));
} else {
  app.get('/', requireAuth, (req, res) => res.sendFile('index.html', { root: publicDir }));
}

// ---------------------------------------------------------------------------
// Static assets (JS, CSS, fonts, lib/) -- served without auth.
// Only HTML entry points are protected above.
// ---------------------------------------------------------------------------
app.use('/', express.static(publicDir, {
  index: false, // Don't auto-serve index.html; we handle / above
}));

// ---------------------------------------------------------------------------
// Interactive tutorial (no auth required)
// ---------------------------------------------------------------------------
app.get('/tutorial', (req, res) => {
  res.sendFile('tutorial.html', { root: publicDir });
});

// ---------------------------------------------------------------------------
// Agent pairing page (auth required)
// ---------------------------------------------------------------------------
app.get('/pair', requireAuth, (req, res) => {
  res.sendFile('pair.html', { root: publicDir });
});

// ---------------------------------------------------------------------------
// Catch-all: redirect unmatched routes to /login
// ---------------------------------------------------------------------------
app.get('*', (req, res) => {
  res.redirect('/login');
});

// ---------------------------------------------------------------------------
// Initialize database and start server with WebSocket relay
// ---------------------------------------------------------------------------
function start() {
  initDatabase();

  // Read latest agent version from the tarball
  let latestAgentVersion = null;
  try {
    const tarballPath = resolve(__dirname, '..', 'dl', '49-agent.tar.gz');
    const result = spawnSync('tar', ['xzf', tarballPath, '--to-stdout', 'agent/package.json'], {
      encoding: 'utf-8',
      timeout: 10000,
    });
    if (result.status !== 0) throw new Error(result.stderr || 'tar extraction failed');
    latestAgentVersion = JSON.parse(result.stdout).version || null;
    console.log(`[cloud] Latest agent version from tarball: ${latestAgentVersion}`);
  } catch (err) {
    console.warn('[cloud] Could not read agent version from tarball:', err.message);
  }

  // Warn if GitHub OAuth is not configured
  if (!config.github.clientId || !config.github.clientSecret) {
    console.warn('');
    console.warn('  WARNING: GitHub OAuth credentials are not configured.');
    console.warn('  Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.');
    console.warn('  The login page will be served, but OAuth login will not work.');
    console.warn('');
  }

  // Create HTTP server from Express app so we can handle WebSocket upgrades
  const server = createServer(app);

  // Set up the WebSocket relay (handles /ws and /agent-ws upgrade routes)
  const { userAgents, userBrowsers } = setupWebSocketRelay(server, { latestAgentVersion });

  // Wire up chat system with browser WebSocket map for real-time push
  setChatBrowsers(userBrowsers);

  server.listen(config.port, config.host, () => {
    console.log(`[cloud] 49Agents Cloud Server`);
    console.log(`[cloud] Listening on http://${config.host}:${config.port}`);
    console.log(`[cloud] Environment: ${config.nodeEnv}`);
  });
}

start();

export default app;
