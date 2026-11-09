// Cache successful and failed results, and share an in-flight request. An outage
// or a burst of health checks must not create an unbounded database queue.
export function cachedQuery(read, ttlMs) {
  let entry;
  return {
    get() {
      if (!entry || (!entry.pending && Date.now() >= entry.expires)) {
        const current = { pending: true, expires: 0 };
        current.promise = Promise.resolve().then(read).finally(() => { current.pending = false; current.expires = Date.now() + ttlMs; });
        entry = current;
      }
      return entry.promise;
    },
    invalidate() { entry = null; },
  };
}
