import { context } from '@opentelemetry/api';
import { propagation } from '@opentelemetry/api';

/**
 * A custom helper that injects _trace attribute into any piece of data.
 * Can also set baggage.
 *
 * @param data Object to inject into.
 * @param baggageEntries Metadata passed forth.
 * @returns Modified obj.
 */

export function injectTraceIntoData<T extends Record<string, any>>(
  data: T,
  baggageEntries?: Record<string, string>,
): T & { [TRACE_FIELD]: TraceCarrier } {
  let ctx = context.active();

  if (baggageEntries && Object.keys(baggageEntries).length) {
    const cur = propagation.getBaggage(ctx) ?? propagation.createBaggage();
    const withBag = Object.entries(baggageEntries).reduce(
      (bag, [k, v]) => bag.setEntry(k, { value: String(v) }),
      cur,
    );
    ctx = propagation.setBaggage(ctx, withBag);
  }

  const carrier: TraceCarrier = {};
  propagation.inject(ctx, carrier);
  return { ...(data as any), [TRACE_FIELD]: carrier };
}
export type TraceCarrier = {
  traceparent?: string;
  tracestate?: string;
  baggage?: string;
};
export const TRACE_FIELD = '__trace' as const;
