// src/telemetry/bullmq-tracing.ts
import {
  context,
  propagation,
  trace,
  SpanKind,
  SpanStatusCode,
} from '@opentelemetry/api';

import { TRACE_FIELD } from '../utils/inject-trace-into-data';

import type { TraceCarrier } from '../utils/inject-trace-into-data';
import type { Context } from '@opentelemetry/api';
import type { Job } from 'bullmq';

/**
 * Decorator for BullMQ worker methods (e.g., WorkerHost.process).
 * - If job.data.__trace exists, extracts and continues that context.
 * - If missing, starts a new span AND injects context into job.data so the next retry is correlated.
 * Hardcoded: tracer 'bullmq-worker', span name = job.name, kind = CONSUMER.
 */
export function WithJobTracing(name: string | undefined): MethodDecorator {
  return (_target: Object, _key: string | symbol, descriptor: PropertyDescriptor) => {
    const original: (...args: any[]) => any = descriptor.value;

    descriptor.value = async function wrapped(job: Job, ...args: any[]) {
      const tracer = trace.getTracer(name ?? 'Worker');

      // Try to extract parent context from job.data.__trace
      const carrier: TraceCarrier | undefined = job?.data?.[TRACE_FIELD];
      const hasCarrier =
        !!carrier &&
        (carrier.traceparent || carrier.tracestate || carrier.baggage);
      const parentCtx: Context | undefined = hasCarrier
        ? propagation.extract(
            context.active(),
            carrier as Record<string, string>,
          )
        : undefined;

      // Start span with parent if present; otherwise as a new root
      const span = tracer.startSpan(
        job.name,
        { kind: SpanKind.CONSUMER },
        parentCtx,
      );
      const runCtx = trace.setSpan(parentCtx ?? context.active(), span);

      // If we had no carrier, inject one now so future retries keep the same trace
      if (!hasCarrier) {
        const newCarrier: TraceCarrier = {};
        propagation.inject(runCtx, newCarrier);
        try {
          await job.updateData({
            ...(job.data ?? {}),
            [TRACE_FIELD]: newCarrier,
          });
        } catch {
          // Non-fatal; the current attempt is still traced
        }
      }

      // Execute under the span, with unified error handling
      return await context.with(runCtx, async () => {
        try {
          const result = await original.apply(this, [job, ...args]);
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (err: any) {
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err?.message });
          throw err;
        } finally {
          span.end();
        }
      });
    };

    return descriptor;
  };
}
