import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { waitForElement } from './waitForElement.js'
import { eligibleSteps } from './eligibility.js'
import { markTourSeen } from './storage.js'

let activeDriver = null

export function isRunning() {
  return activeDriver !== null && activeDriver.isActive()
}

export function destroyActive() {
  if (activeDriver) {
    try { activeDriver.destroy() } catch { /* ignore */ }
    activeDriver = null
  }
}

/**
 * Run a tour. Returns a promise that resolves when the tour finishes or is skipped.
 *
 * @param {object} tour
 * @param {object} ctx  { layout, can, seenVersion, userId, setPage }
 */
export async function runTour(tour, ctx) {
  if (isRunning()) return

  const steps = eligibleSteps(tour, ctx)
  if (steps.length === 0) {
    await markTourSeen(ctx.userId, tour.id, tour.version)
    return
  }

  // For "what's new" runs, prefix the first step title
  const isWhatsNew = ctx.seenVersion !== undefined && ctx.seenVersion < tour.version
  const builtSteps = []

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]

    // Run beforeShow hook if present
    if (step.beforeShow) {
      try { await step.beforeShow(ctx) } catch { /* ignore */ }
      // Give the page time to render after navigation
      await new Promise(r => setTimeout(r, 600))
    }

    if (step.target === null) {
      builtSteps.push({
        popover: {
          title: i === 0 && isWhatsNew ? `New: ${step.title}` : step.title,
          description: step.body,
          side: step.side || 'bottom',
          align: step.align || 'center',
        },
      })
    } else {
      // Resolve element existence upfront so we can skip missing ones
      builtSteps.push({
        _target: step.target,
        _title: i === 0 && isWhatsNew ? `New: ${step.title}` : step.title,
        _body: step.body,
        _side: step.side || 'bottom',
        _align: step.align || 'start',
      })
    }
  }

  // Build driver.js steps, skipping elements that don't exist
  const driverSteps = []
  for (const s of builtSteps) {
    if (s.popover) {
      driverSteps.push({ popover: s.popover })
    } else {
      let el
      try {
        el = await waitForElement(s._target)
      } catch {
        console.debug(`[tour] skipping step — element not found: ${s._target}`)
        continue
      }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      driverSteps.push({
        element: `[data-tour="${s._target}"]`,
        popover: {
          title: s._title,
          description: s._body,
          side: s._side,
          align: s._align,
        },
      })
    }
  }

  if (driverSteps.length === 0) {
    await markTourSeen(ctx.userId, tour.id, tour.version)
    return
  }

  return new Promise(resolve => {
    const onDone = async () => {
      activeDriver = null
      await markTourSeen(ctx.userId, tour.id, tour.version)
      resolve()
    }

    const d = driver({
      showProgress: true,
      progressText: 'Step {{current}} of {{total}}',
      allowClose: true,
      overlayOpacity: 0.55,
      stagePadding: 6,
      stageRadius: 8,
      smoothScroll: true,
      popoverClass: 'frido-tour',
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Finish',
      onDestroyStarted: () => {
        d.destroy()
        onDone()
      },
      steps: driverSteps,
    })

    activeDriver = d
    d.drive()
  })
}
