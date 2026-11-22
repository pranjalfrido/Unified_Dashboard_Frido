/**
 * Pure functions — no side effects, fully unit-testable.
 */

/**
 * Returns the steps from a tour that are eligible for the given context.
 *
 * @param {object} tour        - Tour config object
 * @param {object} ctx
 * @param {string} ctx.layout  - 'desktop' | 'mobile'
 * @param {function} ctx.can   - (permissionId) => boolean
 * @param {number|undefined} ctx.seenVersion
 *   undefined  → new user, show all eligible steps
 *   number     → show only steps with since > seenVersion ("what's new")
 */
export function eligibleSteps(tour, { layout, can, seenVersion }) {
  if (seenVersion !== undefined && seenVersion >= tour.version) return []

  return tour.steps
    .filter(step => (step.layouts ?? tour.layouts).includes(layout))
    .filter(step => !step.permission || can(step.permission))
    .filter(step => seenVersion === undefined || (step.since ?? 1) > seenVersion)
}

/**
 * Whether this tour should auto-start given the current context.
 */
export function isTourEligible(tour, { layout, can, seenVersion, currentPage }) {
  if (tour.trigger === 'page-visit' && tour.page !== currentPage) return false
  const steps = eligibleSteps(tour, { layout, can, seenVersion })
  return steps.length > 0
}
