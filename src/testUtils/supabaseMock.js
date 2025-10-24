const defaultResolved = { data: [], error: null, count: 0 };
const defaultSingle = { data: null, error: null };

function createQueryBuilder(options = {}) {
  const {
    resolved = defaultResolved,
    single = defaultSingle,
    onInsert,
    onUpdate,
    onDelete,
    onEq,
    onSelect,
    onOrder,
    onRange,
  } = options;

  let currentResolved = resolved;
  let currentSingle = single;

  const builder = {
    select: jest.fn((...args) => {
      onSelect?.(...args);
      return builder;
    }),
    order: jest.fn((...args) => {
      onOrder?.(...args);
      return builder;
    }),
    range: jest.fn((...args) => {
      onRange?.(...args);
      return builder;
    }),
    gte: jest.fn((...args) => {
      const result = onRange?.(...args);
      if (result?.resolved) currentResolved = result.resolved;
      if (result?.single) currentSingle = result.single;
      return builder;
    }),
    eq: jest.fn((...args) => {
      const result = onEq?.(...args);
      if (result?.resolved) currentResolved = result.resolved;
      if (result?.single) currentSingle = result.single;
      return builder;
    }),
    insert: jest.fn((payload) => {
      const result = onInsert?.(payload);
      if (result?.resolved) currentResolved = result.resolved;
      if (result?.single) currentSingle = result.single;
      return builder;
    }),
    update: jest.fn((payload) => {
      const result = onUpdate?.(payload);
      if (result?.resolved) currentResolved = result.resolved;
      if (result?.single) currentSingle = result.single;
      return builder;
    }),
    delete: jest.fn((payload) => {
      const result = onDelete?.(payload);
      if (result?.resolved) currentResolved = result.resolved;
      if (result?.single) currentSingle = result.single;
      return builder;
    }),
    single: jest.fn(() => Promise.resolve(currentSingle)),
    maybeSingle: jest.fn(() => Promise.resolve(currentSingle)),
    then: (resolve, reject) => Promise.resolve(currentResolved).then(resolve, reject),
  };

  return builder;
}

const channelFactory = () => {
  const channel = {
    on: jest.fn(() => channel),
    subscribe: jest.fn(() => ({ id: "mock-channel" })),
  };
  return channel;
};

let authUser = null;
let fromHandler = () => createQueryBuilder();
let schemaHandler = null;
let storageHandler = () => ({
  upload: jest.fn(async () => ({ data: { path: "mock" }, error: null })),
  update: jest.fn(async () => ({ data: null, error: null })),
  createSignedUrl: jest.fn(async () => ({ data: { signedUrl: "https://example.com/file" }, error: null })),
});
const authStateListeners = new Set();

const supabase = {
  from: jest.fn((...args) => fromHandler(...args)),
  storage: {
    from: jest.fn((...args) => storageHandler(...args)),
  },
  auth: {
    getUser: jest.fn(async () => ({ data: { user: authUser } })),
    signInWithOtp: jest.fn(async () => ({ data: {}, error: null })),
    signOut: jest.fn(async () => ({ error: null })),
    onAuthStateChange: jest.fn((callback) => {
      const subscription = {
        unsubscribe: jest.fn(() => {
          authStateListeners.delete(callback);
        }),
      };
      authStateListeners.add(callback);
      return { data: { subscription } };
    }),
  },
  channel: jest.fn(() => channelFactory()),
  removeChannel: jest.fn(),
  schema: jest.fn((schemaName) => ({
    from: (...args) => (schemaHandler ? schemaHandler(schemaName, ...args) : fromHandler(...args)),
  })),
};

function __setFromHandler(fn) {
  fromHandler = fn;
}

function __setSchemaHandler(fn) {
  schemaHandler = fn;
}

function __setStorageHandler(fn) {
  storageHandler = fn;
}

function __setAuthUser(user) {
  authUser = user;
}

function __resetSupabaseMock() {
  fromHandler = () => createQueryBuilder();
  schemaHandler = null;
  storageHandler = () => ({
    upload: jest.fn(async () => ({ data: { path: "mock" }, error: null })),
    update: jest.fn(async () => ({ data: null, error: null })),
    createSignedUrl: jest.fn(async () => ({ data: { signedUrl: "https://example.com/file" }, error: null })),
  });
  authUser = null;
  authStateListeners.clear();
  supabase.from.mockClear();
  supabase.storage.from.mockClear();
  supabase.auth.getUser.mockClear();
  supabase.auth.signInWithOtp.mockClear();
  supabase.auth.signOut.mockClear();
  supabase.auth.onAuthStateChange.mockClear();
  supabase.channel.mockClear();
  supabase.removeChannel.mockClear();
  supabase.schema.mockClear();
}

module.exports = {
  supabase,
  createQueryBuilder,
  __setFromHandler,
  __setSchemaHandler,
  __setStorageHandler,
  __setAuthUser,
  __resetSupabaseMock,
};
