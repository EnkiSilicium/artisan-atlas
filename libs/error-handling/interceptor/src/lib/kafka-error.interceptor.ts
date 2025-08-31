// common/kafka-app-error.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  Inject,
} from '@nestjs/common';
import { ClientKafka, KafkaContext } from '@nestjs/microservices';
import { Observable, EMPTY, from, throwError, lastValueFrom, firstValueFrom } from 'rxjs';
import { catchError, mergeMap, map, ignoreElements, defaultIfEmpty } from 'rxjs/operators';

// Your error base + concrete types
import { AppError } from 'error-handling/error-core';
import { DomainError } from 'error-handling/error-core';
import { InfraError } from 'error-handling/error-core';
import { ProgrammerError } from 'error-handling/error-core';

import { KAFKA_PRODUCER } from 'persistence';


export class KafkaErrorInterceptorOptions {
  maxRetries!: number; // e.g. 5
  dlqSuffix?: string; // default ".DLQ"
  attemptsHeader?: string; // default "x-attempts"
}

/**
 * Kafka interceptor that:
 * - On success commits the offset.
 * - On error:
 *   - If it's one of our AppError types AND retryable AND attempts < max → do not commit (let redelivery happen).
 *   - Otherwise: publish to DLQ then commit to prevent poison loops.
 *
 * Notes:
 * - This interceptor does not itself increase the attempts header; if you use retry-topics, let the router do it.
 * - DLQ payload contains the original message plus a compact error summary. Unknown errors are labeled as "unknown".
 */
@Injectable()
export class KafkaErrorInterceptor implements NestInterceptor {

  @Inject(KAFKA_PRODUCER)
  private readonly dlqProducer!: ClientKafka

  private readonly dlqSuffix: string;
  private readonly attemptsHeader: string;


  constructor(
    private readonly opts: KafkaErrorInterceptorOptions = { maxRetries: 5 },
  ) {
    this.dlqSuffix = opts.dlqSuffix ?? '.DLQ';
    this.attemptsHeader = opts.attemptsHeader ?? 'x-attempts';
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {

    Logger.log({ message: "KafkaErrorInterceptor active" })
    // Only handle Kafka (RPC) traffic; let HTTP go through the HTTP pipeline.
    if (context.getType() !== 'rpc') return next.handle();

    const kafkaCtx = context.switchToRpc().getContext<KafkaContext>();
    const msg = kafkaCtx.getMessage();
    const topic = kafkaCtx.getTopic();
    const partition = kafkaCtx.getPartition();
    // Nest versions differ: prefer method, fallback to property.
    const consumer =
      (kafkaCtx as any).getConsumer?.() ?? (kafkaCtx as any).consumer;

    const currentOffset = BigInt(msg.offset);
    const nextOffset = (currentOffset + 1n).toString();

    return next.handle().pipe(
      // Success path: commit then return the controller result.
      mergeMap((result) =>
        from(this.commit(consumer, topic, partition, nextOffset)).pipe(
          map(() => result),
        ),
      ),
      catchError((error: unknown) => {
        // Log raw error object for ops.
        Logger.error(
          { ...(error as any) },
          undefined,
          KafkaErrorInterceptor.name,
        );
        Logger.log({ message: "KafkaErrorInterceptor handling" })

        const attempts = this.getAttempts(msg);
        const max = this.opts.maxRetries ?? 5;
        const isOurError =
          error instanceof DomainError ||
          error instanceof InfraError ||
          error instanceof ProgrammerError;

        const appErr: AppError | undefined = isOurError
          ? (error as AppError)
          : undefined;

        // Retryable and within limit → do not commit; redelivery will happen.
        if (appErr?.retryable && attempts < max) {
          return throwError(() => error);
        }

        // Not retryable, or we exhausted attempts → DLQ then commit.
        const act = async () => {
          try {
            await this.sendToDlq(topic, msg, appErr, error);
          } catch (dlqErr) {
            // If DLQ publishing fails, DO NOT commit; let redelivery retry DLQ.
            Logger.error(
              { ...(dlqErr as any) },
              undefined,
              'KafkaErrorInterceptor.DLQ',
            );
            throw error; // propagate so message remains uncommitted
          }
          await this.commit(consumer, topic, partition, nextOffset);
        };

        return from(this.sendToDlq(topic, msg, appErr, error)).pipe(
          // emit a single value so lastValueFrom has something to resolve
          map(() => undefined as void),
          catchError((dlqErr) => {
            Logger.error({ dlqErr }, undefined, 'KafkaErrorInterceptor.DLQ');
            return throwError(() => error);       // DLQ failed → keep uncommitted
          }),
        );
      }),
    );
  }

  /** Extract attempts count from headers, tolerant of Buffer/string/number. */
  private getAttempts(msg: any): number {
    const h = msg?.headers || {};
    const raw =
      h[this.attemptsHeader] ?? h[String(this.attemptsHeader).toLowerCase()];
    if (raw === undefined) return 0;
    if (Buffer.isBuffer(raw)) return Number(raw.toString()) || 0;
    return Number(raw) || 0;
  }

  /** Commit the next offset for the current topic/partition. Safe no-op if consumer is missing. */
  private async commit(
    consumer: any,
    topic: string,
    partition: number,
    nextOffset: string,
  ): Promise<void> {
    if (!consumer?.commitOffsets) return;
    await consumer.commitOffsets([{ topic, partition, offset: nextOffset }]);
  }

  /**
   * Send the original message to DLQ with a compact error summary.
   * If the error is not an AppError, label it as kind="unknown", code="UNCLASSIFIED".
   */
  private async sendToDlq(
    topic: string,
    originalMsg: any,
    appErr: AppError | undefined,
    unknownErr: unknown,
  ): Promise<void> {
    const dlqTopic = `${topic}${this.dlqSuffix}`;
    const summary = this.buildErrorSummary(appErr, unknownErr);

    const obs = this.dlqProducer.emit(dlqTopic, {
      key: originalMsg.key,
      headers: {
        ...originalMsg.headers,
        'x-error-kind': summary.kind,
        'x-error-service': summary.service,
        'x-error-code': summary.code,
      },
      value: {
        original: originalMsg.value,
        error: summary,
      },
    });

    await firstValueFrom(obs.pipe(ignoreElements(), defaultIfEmpty(undefined)));

  }

  /** Convert either an AppError or an arbitrary thrown value into a DLQ error summary. */
  private buildErrorSummary(
    appErr: AppError | undefined,
    unknownErr: unknown,
  ): {
    kind: string;
    service: string | undefined;
    code: string;
    message: string;
    retryable: boolean;
    v: number | undefined;
    details?: unknown;
  } {
    if (appErr) {
      return {
        kind: appErr.kind,
        service: appErr.service,
        code: appErr.code,
        message: appErr.message,
        retryable: appErr.retryable,
        v: appErr.v,
        details: appErr.details,
      };
    }

    // Unknown error: keep it compact but useful.
    const msg =
      typeof unknownErr === 'object' &&
        unknownErr !== null &&
        'message' in unknownErr
        ? String((unknownErr as any).message)
        : String(unknownErr);

    return {
      kind: 'unknown',
      service: 'infra',
      code: 'UNCLASSIFIED',
      message: msg,
      retryable: false,
      v: 1,
      // keep the raw value in case you want it in DLQ; it’s your call to trim later
      details: { raw: this.safeErrorShape(unknownErr) },
    };
  }

  /** Avoid circulars/giants when putting unknown errors into DLQ details. */
  private safeErrorShape(value: unknown): unknown {
    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack };
    }
    if (typeof value === 'object' && value) {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch {
        return String(value);
      }
    }
    return value;
  }
}
