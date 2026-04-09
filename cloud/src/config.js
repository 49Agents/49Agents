const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

// In production, JWT secrets MUST be set — refuse to start with known defaults
if (isProduction) {
  if (!process.env.JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET must be set in production. Refusing to start with default secret.');
  }
  if (!process.env.AGENT_JWT_SECRET) {
    throw new Error('FATAL: AGENT_JWT_SECRET must be set in production. Refusing to start with default secret.');
  }
}

export const config = {
  port: parseInt(process.env.PORT || '1071'),
  host: process.env.HOST || '0.0.0.0',
  dbPath: process.env.DATABASE_PATH || './data/tc.db',
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    callbackUrl: process.env.GITHUB_CALLBACK_URL || 'http://localhost:1071/auth/github/callback',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:1071/auth/google/callback',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    agentSecret: process.env.AGENT_JWT_SECRET || 'dev-agent-secret-change-in-production',
    userTtl: '1h',
    refreshTtl: '7d',
  },
  cloudHost: process.env.CLOUD_HOST || 'localhost:1071',
  appHost: process.env.APP_HOST || '',
  landingDir: process.env.LANDING_DIR || '',
  discord: {
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
  },
  adminUserId: process.env.ADMIN_USER_ID || '',
  cloudAuthUrl: process.env.CLOUD_AUTH_URL || 'https://app.49agents.com',
  nodeEnv,
};
