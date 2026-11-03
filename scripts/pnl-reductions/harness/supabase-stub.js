// Parity pages only: no Supabase session, so authFetch sends plain requests.
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null } }),
    refreshSession: async () => ({ data: { session: null } }),
  },
}
