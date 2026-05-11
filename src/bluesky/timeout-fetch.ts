// atproto's Agent convenience methods (post, uploadBlob, login) don't expose
// an AbortSignal, so the timeout is injected at the CredentialSession fetch.
export function withTimeoutFetch(
  underlying: typeof globalThis.fetch,
  timeoutMs: number,
): typeof globalThis.fetch {
  return (input, init) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const callerSignal = init?.signal;
    const signal = callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;
    return underlying(input, { ...init, signal });
  };
}
