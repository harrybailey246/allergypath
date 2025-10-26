const chain = () => ({
  select: () => chain(),
  eq: () => chain(),
  maybeSingle: () => Promise.resolve({ data: null, error: null }),
});

export const supabase = {
  auth: {
    getUser: () => Promise.resolve({ data: { user: { id: "user-123", email: "clinician@example.com" } } }),
    onAuthStateChange: () => ({
      data: { subscription: { unsubscribe: () => {} } },
    }),
    signOut: () => {},
  },
  from: () => chain(),
};
