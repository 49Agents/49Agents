/**
 * Stripe Billing Routes
 *
 * Handles checkout sessions, customer portal, and webhook events.
 * Stripe is optional — if STRIPE_SECRET_KEY is not set, these routes
 * return helpful error messages instead of crashing.
 */

import Stripe from 'stripe';
import { config } from '../config.js';
import { requireAuth } from '../auth/middleware.js';
import { getUserById } from '../db/users.js';
import { getDb } from '../db/index.js';

let stripeInstance = null;
function ensureStripe() {
  if (stripeInstance) return stripeInstance;
  if (!config.stripe.secretKey) return null;
  stripeInstance = new Stripe(config.stripe.secretKey);
  return stripeInstance;
}

/**
 * Update user's Stripe customer ID.
 */
function updateStripeCustomerId(userId, customerId) {
  const db = getDb();
  db.prepare(
    "UPDATE users SET stripe_customer_id = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(customerId, userId);
}

/**
 * Update user's Stripe subscription ID.
 */
function updateStripeSubscriptionId(userId, subscriptionId) {
  const db = getDb();
  db.prepare(
    "UPDATE users SET stripe_subscription_id = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(subscriptionId, userId);
}

/**
 * Update user's tier.
 */
function updateUserTier(userId, tier) {
  const db = getDb();
  db.prepare(
    "UPDATE users SET tier = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(tier, userId);
}

/**
 * Find user by Stripe customer ID.
 */
function getUserByStripeCustomerId(customerId) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE stripe_customer_id = ?').get(customerId) || null;
}

/**
 * Set up billing API routes on the Express app.
 */
export function setupBillingRoutes(app) {

  // POST /api/billing/checkout — Create a Stripe Checkout session
  app.post('/api/billing/checkout', requireAuth, async (req, res) => {
    const s = ensureStripe();
    if (!s) {
      return res.status(503).json({ error: 'Billing not configured. Set STRIPE_SECRET_KEY.' });
    }

    const user = getUserById(req.user.id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    if (user.tier === 'pro') {
      return res.status(400).json({ error: 'Already on Pro plan' });
    }

    try {
      // Create or reuse Stripe customer
      let customerId = user.stripe_customer_id;
      if (!customerId) {
        const customer = await s.customers.create({
          email: user.email || undefined,
          metadata: { userId: user.id, githubLogin: user.github_login },
        });
        customerId = customer.id;
        updateStripeCustomerId(user.id, customerId);
      }

      const priceId = req.body.annual ? config.stripe.proAnnualPriceId : config.stripe.proMonthlyPriceId;
      if (!priceId) {
        return res.status(503).json({ error: 'Stripe price IDs not configured' });
      }

      const session = await s.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${config.stripe.successUrl || '/'}?checkout=success`,
        cancel_url: `${config.stripe.cancelUrl || '/'}?checkout=cancel`,
        metadata: { userId: user.id },
      });

      res.json({ checkoutUrl: session.url });
    } catch (e) {
      console.error('[billing] Checkout error:', e.message);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  // GET /api/billing/portal — Get Stripe Customer Portal URL
  app.get('/api/billing/portal', requireAuth, async (req, res) => {
    const s = ensureStripe();
    if (!s) {
      return res.status(503).json({ error: 'Billing not configured' });
    }

    const user = getUserById(req.user.id);
    if (!user?.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account found' });
    }

    try {
      const session = await s.billingPortal.sessions.create({
        customer: user.stripe_customer_id,
        return_url: config.stripe.successUrl || '/',
      });
      res.json({ portalUrl: session.url });
    } catch (e) {
      console.error('[billing] Portal error:', e.message);
      res.status(500).json({ error: 'Failed to create portal session' });
    }
  });

  // GET /api/billing/status — Get billing status for current user
  app.get('/api/billing/status', requireAuth, (req, res) => {
    const user = getUserById(req.user.id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    res.json({
      tier: user.tier || 'free',
      hasStripe: !!user.stripe_customer_id,
      stripeConfigured: !!config.stripe.secretKey,
    });
  });
}

/**
 * Handle Stripe webhook events.
 * This must be called BEFORE express.json() middleware because
 * Stripe requires the raw body for signature verification.
 *
 * @param {express.Request} req
 * @param {express.Response} res
 */
export async function handleStripeWebhook(req, res) {
  const s = ensureStripe();
  if (!s) {
    return res.status(503).send('Billing not configured');
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = config.stripe.webhookSecret;

  if (!webhookSecret) {
    console.error('[billing] STRIPE_WEBHOOK_SECRET not set');
    return res.status(500).send('Webhook secret not configured');
  }

  let event;
  try {
    event = s.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (e) {
    console.error('[billing] Webhook signature verification failed:', e.message);
    return res.status(400).send('Invalid signature');
  }

  console.log(`[billing] Webhook: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        if (userId) {
          updateUserTier(userId, 'pro');
          if (session.subscription) {
            updateStripeSubscriptionId(userId, session.subscription);
          }
          console.log(`[billing] User ${userId} upgraded to pro`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const user = getUserByStripeCustomerId(customerId);
        if (user) {
          const status = subscription.status;
          if (status === 'active' || status === 'trialing') {
            updateUserTier(user.id, 'pro');
          } else if (status === 'past_due') {
            // Grace period — keep pro for now
            console.log(`[billing] User ${user.id} payment past due, grace period active`);
          } else {
            updateUserTier(user.id, 'free');
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const user = getUserByStripeCustomerId(customerId);
        if (user) {
          updateUserTier(user.id, 'free');
          updateStripeSubscriptionId(user.id, null);
          console.log(`[billing] User ${user.id} downgraded to free`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const user = getUserByStripeCustomerId(customerId);
        if (user) {
          console.log(`[billing] Payment failed for user ${user.id}`);
          // Could send email, set grace period, etc.
        }
        break;
      }
    }
  } catch (e) {
    console.error(`[billing] Webhook handler error (${event.type}):`, e);
  }

  res.json({ received: true });
}
