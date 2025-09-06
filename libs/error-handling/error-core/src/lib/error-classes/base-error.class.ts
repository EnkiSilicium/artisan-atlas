import type { BaseDescriptor } from 'error-handling/error-core';
import type { ErrorKind } from 'error-handling/error-core';

export class AppError extends Error {
  readonly kind: ErrorKind;
  readonly service: string;
  readonly code: string;
  readonly retryable: boolean;
  readonly httpStatus: number;
  readonly v: number;
  /**Metadata, essentially. */
  readonly details?: Record<string, unknown>;
  /**Original error goes here. */
  //@ts-ignore
  override readonly cause?: Record<string, unknown>;

  protected constructor(args: {
    kind: ErrorKind;
    errorObject: BaseDescriptor<string>;
    details?: Record<string, unknown>;
    cause?: Record<string, unknown>;
  }) {
    super(args.errorObject.message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;

    this.kind = args.kind;
    this.service = args.errorObject.service;
    this.code = args.errorObject.code;
    this.retryable = args.errorObject.retryable;
    this.httpStatus = args.errorObject.httpStatus;
    this.v = args.errorObject.v;

    if (args.details !== undefined) this.details = args.details;
    if (args.cause !== undefined) {
      (this as Record<string, unknown>)['cause'] = args.cause;
    }
  }
}
