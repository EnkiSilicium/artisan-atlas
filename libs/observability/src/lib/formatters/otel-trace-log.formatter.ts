import { context, trace } from '@opentelemetry/api';
import { format } from 'winston';

/**
 * Winston format that injects OpenTelemetry trace and span IDs
 * into each log record under `trace_id` and `span_id`.
 */
export const otelTraceLogFormatter = format((info) => {
  // Grab the currently active span
  const span = trace.getSpan(context.active());
  if (span) {
    const { traceId, spanId } = span.spanContext();
    info.trace_id = traceId;
    info.span_id = spanId;
  } else {
    // Optionally mark logs with no active span
    info.trace_id = undefined;
    info.span_id = undefined;
  }
  return info;
});
