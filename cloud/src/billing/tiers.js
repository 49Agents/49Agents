/**
 * Tier Configuration — Single Source of Truth
 *
 * All tier limits are defined here. Both the enforcement module
 * and the API routes import from this file.
 */

export const TIERS = {
  free: {
    agents: 2,
    terminalPanes: 7,
    filePanes: Infinity,
    notes: Infinity,
    gitGraphs: Infinity,
    noteImages: 10,
    relay: true,
    collaboration: false,
  },
  pro: {
    agents: 6,
    terminalPanes: 40,
    filePanes: Infinity,
    notes: Infinity,
    gitGraphs: Infinity,
    noteImages: 100,
    relay: true,
    collaboration: false,
  },
  poweruser: {
    agents: 24,
    terminalPanes: 160,
    filePanes: Infinity,
    notes: Infinity,
    gitGraphs: Infinity,
    noteImages: 400,
    relay: true,
    collaboration: false,
  },
};

export const DEFAULT_TIER = 'pro';

export function getTierLimits(tier) {
  return TIERS[tier] || TIERS[DEFAULT_TIER];
}
