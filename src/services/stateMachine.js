/**
 * State Machine Module
 * Defines valid state transitions for Asset, SiteKit, and Link entities.
 * Extensible for phases 2–4.
 */

const TRANSITIONS = {
  Asset: {
    STOCKED: ["ALLOCATED", "MAINTENANCE", "RETIRED"],
    ALLOCATED: ["STOCKED", "STAGING"],
    STAGING: ["QA_PASSED", "STOCKED"],
    QA_PASSED: ["STAGED"],
    STAGED: ["DISPATCHED"],
    DISPATCHED: ["IN_TRANSIT"],
    IN_TRANSIT: ["ARRIVED"],
    ARRIVED: ["FIELD_INSTALLATION"],
    FIELD_INSTALLATION: ["INSTALLED"],
    INSTALLED: ["COMMISSIONED"],
    COMMISSIONED: ["LIVE"],
    LIVE: ["MAINTENANCE"],
    MAINTENANCE: ["STOCKED", "LIVE", "RETIRED"],
    RETIRED: [],
  },
  SiteKit: {
    DRAFT: ["READY_FOR_STAGING"],
    READY_FOR_STAGING: ["STAGING", "DRAFT"],
    STAGING: ["STAGED", "DRAFT"],
    STAGED: ["DISPATCHED"],
    DISPATCHED: ["INSTALLED"],
    INSTALLED: [],
  },
  Link: {
    PLANNED: ["KIT_ASSIGNED"],
    KIT_ASSIGNED: ["STAGING", "PLANNED"],
    STAGING: ["DISPATCHED"],
    DISPATCHED: ["IN_TRANSIT"],
    IN_TRANSIT: ["INSTALLING"],
    INSTALLING: ["INSTALLED"],
    INSTALLED: ["COMMISSIONED"],
    COMMISSIONED: ["LIVE"],
    LIVE: ["MAINTENANCE"],
    MAINTENANCE: ["LIVE"],
  },
};

class InvalidTransitionError extends Error {
  constructor(domain, from, to) {
    super(`Cannot move ${domain} from ${from} to ${to}`);
    this.status = 409;
  }
}

/**
 * Check if a transition is valid
 * @param {string} domain - Entity type (Asset, SiteKit, Link)
 * @param {string} from - Current status
 * @param {string} to - Target status
 * @returns {boolean}
 */
function canTransition(domain, from, to) {
  return (TRANSITIONS[domain]?.[from] || []).includes(to);
}

/**
 * Assert a transition is valid, throw if not
 * @param {string} domain - Entity type
 * @param {string} from - Current status
 * @param {string} to - Target status
 * @throws {InvalidTransitionError}
 */
function assertTransition(domain, from, to) {
  if (!canTransition(domain, from, to)) {
    throw new InvalidTransitionError(domain, from, to);
  }
}

/**
 * Get all valid next states for a given status
 * @param {string} domain - Entity type
 * @param {string} from - Current status
 * @returns {string[]} Array of valid next statuses
 */
function getAllowedNext(domain, from) {
  return TRANSITIONS[domain]?.[from] || [];
}

module.exports = {
  canTransition,
  assertTransition,
  getAllowedNext,
  InvalidTransitionError,
};
