import { createContext, useContext } from 'react'

// Shared by FeedbackProvider and every entry point. Outside a provider the hook is a harmless no-op.
export const FeedbackCtx = createContext(null)
const NOOP = { open() {}, publishView() {}, registerRestore() {}, restore() {}, badge: { unseen: 0, newCount: 0 }, notices: [], ackNotices() {}, clearAcked() {}, isAdmin: false, token: null, refresh() {}, showToast() {}, getView: () => ({}) }
export const useFeedback = () => useContext(FeedbackCtx) || NOOP
