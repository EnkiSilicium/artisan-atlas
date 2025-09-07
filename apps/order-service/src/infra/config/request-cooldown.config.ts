export interface RequestCooldownConfig {
  ttlSeconds: number;
}

export function requestCooldownConfig(
  override?: Partial<RequestCooldownConfig>,
): RequestCooldownConfig {
  return {
    ttlSeconds: Number(process.env.REQUEST_COOLDOWN_TTL ?? 1),
    ...(override ?? {}),
  };
}

