// common/http-app-error.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
  Logger,
  HttpException,
} from '@nestjs/common';
import {
  AppError,
  DomainError,
  InfraError,
  ProgrammerError,
} from 'error-handling/error-core';
import { Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { assertIsObject } from 'shared-kernel';

export class HttpErrorInterceptorOptions {
  includeTupleInBody?: boolean;
  retryAfterSeconds?: number;
  addNoStoreHeaders?: boolean;
}

@Injectable()
export class HttpErrorInterceptor implements NestInterceptor {
  constructor(
    private readonly opts: HttpErrorInterceptorOptions = {
      includeTupleInBody: false,
      retryAfterSeconds: 1,
      addNoStoreHeaders: true,
    },
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    Logger.debug({ message: `${HttpErrorInterceptor.name} active` });

    if (context.getType() !== 'http') return next.handle(); // don’t touch Kafka/RPC

    return next.handle().pipe(
      catchError((err: Error) => {
        if (err instanceof HttpException) throw err; //"idempotent" for HttpExceptions

        Logger.error({ ...err }, undefined, 'HttpErrorInterceptor');

        const res = context.switchToHttp().getResponse();

        // If headers are already sent, rethrow and let Nest blow up loudly (it can’t fix this).
        if (this.headersSent(res)) throw err;

        const isAppError =
          err instanceof DomainError ||
          err instanceof InfraError ||
          err instanceof ProgrammerError;

        // Unknown → 500 generic body
        if (!isAppError) {
          this.maybeNoStore(res);
          if ((err as unknown as Record<string, unknown>)['retryable']) {
            this.setHeader(
              res,
              'Retry-After',
              String(this.opts.retryAfterSeconds ?? 1),
            );
          }
          const body = { message: 'Unexpected error', retryable: false };
          throw new HttpException(body, HttpStatus.INTERNAL_SERVER_ERROR);
        }

        const e = err as AppError;

        const status =
          e.httpStatus ??
          (e instanceof DomainError
            ? HttpStatus.BAD_REQUEST
            : e instanceof InfraError
              ? HttpStatus.SERVICE_UNAVAILABLE
              : HttpStatus.INTERNAL_SERVER_ERROR);

        if (e.retryable) {
          this.setHeader(
            res,
            'Retry-After',
            String(this.opts.retryAfterSeconds ?? 1),
          );
        }
        this.maybeNoStore(res);

        const body: Record<string, unknown> = {
          message: e.message,
          retryable: e.retryable,
          details: e.details ?? undefined,
        };
        if (this.opts.includeTupleInBody) {
          body['error'] = { kind: e.kind, service: e.service, code: e.code };
          body['v'] = e.v;
        }

        throw new HttpException(body, status);
      }),
    );
  }

  private headersSent(res: unknown): boolean {
    assertIsObject(res);
    return Boolean(res['headersSent'] ?? res['sent']);
  }
  private setHeader(res: unknown, name: string, value: string) {
    assertIsObject(res);
    const fn = (res['setHeader'] ?? res['header']) as
      | ((n: string, v: string) => unknown)
      | undefined;
    if (typeof fn === 'function') return fn.call(res, name, value);
  }
  private maybeNoStore(res: unknown) {
    if (!this.opts.addNoStoreHeaders) return;
    this.setHeader(
      res,
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate',
    );
    this.setHeader(res, 'Pragma', 'no-cache');
    this.setHeader(res, 'Expires', '0');
    this.setHeader(res, 'Surrogate-Control', 'no-store');
  }
}
