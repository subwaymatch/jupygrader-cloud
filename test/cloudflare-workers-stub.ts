export const env = {};
export const waitUntil = (promise: Promise<unknown>) => void promise.catch(() => {});
