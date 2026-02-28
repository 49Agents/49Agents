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
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    proMonthlyPriceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || '',
    proAnnualPriceId: process.env.STRIPE_PRO_ANNUAL_PRICE_ID || '',
    successUrl: process.env.STRIPE_SUCCESS_URL || '/',
    cancelUrl: process.env.STRIPE_CANCEL_URL || '/',
  },
  cloudHost: process.env.CLOUD_HOST || 'localhost:1071',
  appHost: process.env.APP_HOST || '',
  landingDir: process.env.LANDING_DIR || '',
  discord: {
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
  },
  adminUserId: process.env.ADMIN_USER_ID || '',
  nodeEnv: process.env.NODE_ENV || 'development',
};
