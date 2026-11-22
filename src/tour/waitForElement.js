const TIMEOUT_MS = 5000

/**
 * Resolves with the element when [data-tour="target"] exists and has a non-zero bounding box.
 * Rejects (after TIMEOUT_MS) if the element never appears — caller should skip the step.
 */
export function waitForElement(target) {
  return new Promise((resolve, reject) => {
    const selector = `[data-tour="${target}"]`

    function check() {
      const el = document.querySelector(selector)
      if (el) {
        const rect = el.getBoundingClientRect()
        if (rect.width > 0 || rect.height > 0) {
          resolve(el)
          return true
        }
      }
      return false
    }

    if (check()) return

    const timer = setTimeout(() => {
      observer.disconnect()
      console.debug(`[tour] waitForElement timeout: ${selector}`)
      reject(new Error(`timeout: ${selector}`))
    }, TIMEOUT_MS)

    const observer = new MutationObserver(() => {
      requestAnimationFrame(() => {
        if (check()) {
          clearTimeout(timer)
          observer.disconnect()
        }
      })
    })

    observer.observe(document.body, { childList: true, subtree: true, attributes: true })
  })
}
