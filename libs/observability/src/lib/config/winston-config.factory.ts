import { otelTraceLogFormatter } from 'libs/observability/src/lib/formatters/otel-trace-log.formatter';
import { extractBoolEnv } from 'shared-kernel';
import * as winston from 'winston';

export type LoggerFactoryOverrides = {
  serviceName?: string;
  level?: 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly';
  logFile?: string;
  production?: boolean;
  prettyDev?: boolean;
};

export function makeWinstonOptions(overrides: LoggerFactoryOverrides = {}) {
  const production =
    overrides.production ?? process.env.NODE_ENV === 'production';
  const level =
    overrides.level ??
    (extractBoolEnv(process.env.DEBUG) ? 'debug' : 'verbose');

  const serviceName = overrides.serviceName ?? 'order-service';

  const baseFormat = winston.format.combine(
    //makeRedactFormat(REDACTION_PATHS, 2),
    otelTraceLogFormatter(),
    winston.format.timestamp(),
  );

  const prodFormat = winston.format.combine(baseFormat, winston.format.json());

  const devFormat = winston.format.combine(
    baseFormat,
    winston.format.colorize({ all: true }),
    winston.format.errors({ stack: true }),
    winston.format.printf(
      ({ level, message, context, stack, ...rest }) =>
        `[${context || serviceName}] ${level}: ${message} ${stack ? `\n${stack}` : ''} ${Object.keys(rest).length ? `\nMETA: ${JSON.stringify(rest)}` : ''}`,
    ),
  );

  const consoleTransport = new winston.transports.Console({
    level,
    format: production ? prodFormat : devFormat,
  });

  return {
    transports: { consoleTransport },
    exceptionHandlers: {
      consoleTransport: new winston.transports.Console({
        format: production ? prodFormat : devFormat,
      }),
    },
  } as const;
}
