export const extractStrEnvWithFallback = (
  env: unknown,
  fallback: string,
): string => (typeof env === 'string' && env !== '' ? env : fallback);
