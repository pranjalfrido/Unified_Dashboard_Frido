// Password rule shared by the Change password, Create user, Reset password and set-new-password forms (browser) and by
// api/auth-admin.js (server). It matches the Supabase Auth setting: 8+ characters with a lower case letter, an upper
// case letter, a digit and a symbol. Supabase enforces it too; this gives the message before the round trip.
export const PASSWORD_RULE = 'At least 8 characters, with a lower case letter, an upper case letter, a number and a symbol.'

// Returns '' when the password is fine, otherwise the plain-words reason.
export function passwordProblem(pw) {
  const p = String(pw || '')
  if (p.length < 8) return 'The password must be at least 8 characters.'
  if (!/[a-z]/.test(p)) return 'Add a lower case letter (a-z).'
  if (!/[A-Z]/.test(p)) return 'Add an upper case letter (A-Z).'
  if (!/[0-9]/.test(p)) return 'Add a number (0-9).'
  if (!/[^A-Za-z0-9]/.test(p)) return 'Add a symbol, for example ! @ # $ %.'
  return ''
}

// A Supabase password error in plain words. Returns the original message for anything else.
export function passwordErrorText(error) {
  const code = error?.code || ''
  const msg = String(error?.message || '')
  if (code === 'weak_password' || /weak|pwned|leaked|should contain|at least \d+ char/i.test(msg)) {
    const reasons = Array.isArray(error?.reasons) ? error.reasons : []
    if (reasons.includes('pwned') || /pwned|leaked|breach/i.test(msg)) return 'This password has appeared in a known data leak. Choose a different one.'
    return `That password is too weak. ${PASSWORD_RULE}`
  }
  if (code === 'same_password' || /different from the old/i.test(msg)) return 'The new password must be different from your current one.'
  if (code === 'reauthentication_needed' || /current password/i.test(msg)) return 'Enter your current password to change it.'
  return msg || 'Could not update the password. Try again.'
}
