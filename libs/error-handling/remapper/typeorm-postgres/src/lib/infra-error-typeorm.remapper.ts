// infra/typeorm/pg-infra-remapper.ts
import * as PG from '@drdgvhbh/postgres-error-codes';
import { InfraError } from 'error-handling/error-core';
import { ProgrammerError } from 'error-handling/error-core';
import { DomainError } from 'error-handling/error-core';
import { InfraErrorRegistry } from 'error-handling/registries/common';
import { assertIsObject } from 'shared-kernel';
import { QueryFailedError } from 'typeorm';

import type { ErrorRegistryInterface } from 'error-handling/error-core';

/**
 * Takes in the driver/connection/custom-infra error and rethrows a remapped version of it
 * (of Infra domain error type).
 *
 * @param error any. If already mapped, rethrows.
 * @param context event.g., { dependency:'postgres', operation:'updateGuarded', table:'orders' }
 * @returns never - always throws
 */
export function remapTypeOrmPgErrorToInfra(
  error: unknown,
  context: Record<string, unknown> = {},
): never {
  assertIsObject(error);

  const infraRegistry: ErrorRegistryInterface<string> = InfraErrorRegistry;

  const CODES = infraRegistry.codes as Record<string, string>;
  const byCode = infraRegistry.byCode as Record<string, any>;

  // rethrow if already mapped
  if (error instanceof InfraError) {
    throw error;
  }
  if (error instanceof ProgrammerError) {
    throw error;
  }

  if (error instanceof DomainError) {
    throw error;
  }

  const throwInfra = (
    codeKey: keyof typeof CODES,
    extra: Record<string, unknown> = {},
  ) => {
    const code = CODES[codeKey];
    throw new InfraError({
      errorObject: byCode[code],
      details: { ...context, ...extra },
      cause: { originalError: error },
    });
  };

  // 1) Node/driver socket errors (not wrapped by QueryFailedError)
  // UNAVAILABLE — dependency cannot be reached at all.
  const nodeCode = error['code'] ? String(error['code']) : '';
  if (
    /^(ECONNRESET|ECONNREFUSED|EPIPE|ENETUNREACH|EHOSTUNREACH)$/i.test(nodeCode)
  ) {
    return throwInfra('UNAVAILABLE', { nodeCode });
  }
  // TIMEOUT.
  if (/^ETIMEDOUT$/i.test(nodeCode)) {
    return throwInfra('TIMEOUT', { nodeCode });
  }

  // 2) TypeORM-wrapped PG error
  if (error instanceof QueryFailedError) {
    const drv: any = error.driverError ?? {};
    const sqlstate: string = drv.code ?? '';
    const message: string = drv.message ?? String(error.message ?? '');
    const table: string | undefined = drv.table;
    const column: string | undefined = drv.column;
    const constraint: string | undefined = drv.constraint;

    // Exact SQLSTATE → Infra code
    // TX_CONFLICT — serialization/deadlock contention; safe to retry.
    if (
      sqlstate === PG.PG_SERIALIZATION_FAILURE || // '40001'
      sqlstate === PG.PG_DEADLOCK_DETECTED // '40P01'
    ) {
      return throwInfra('TX_CONFLICT', { sqlstate, table, column, constraint });
    }

    // LOCK_TIMEOUT — could not acquire a lock in time.
    if (sqlstate === PG.PG_LOCK_NOT_AVAILABLE) {
      // '55P03'
      return throwInfra('LOCK_TIMEOUT', { sqlstate, table, column });
    }

    // TIMEOUT — query canceled (statement timeout).
    if (sqlstate === PG.PG_QUERY_CANCELED) {
      // '57014'
      return throwInfra('TIMEOUT', { sqlstate, table });
    }

    // UNAVAILABLE — server says “cannot connect now.”
    if (sqlstate === PG.PG_CANNOT_CONNECT_NOW) {
      // '57P03'
      return throwInfra('UNAVAILABLE', { sqlstate });
    }

    // RESOURCE_EXHAUSTED — too many conns, limits, disk/mem exhausted.
    if (
      sqlstate === PG.PG_TOO_MANY_CONNECTIONS || // '53300'
      sqlstate === PG.PG_CONFIGURATION_LIMIT_EXCEEDED || // '53400'
      sqlstate === PG.PG_DISK_FULL || // '53100'
      sqlstate === PG.PG_OUT_OF_MEMORY // '53200'
    ) {
      return throwInfra('RESOURCE_EXHAUSTED', { sqlstate, table });
    }

    // Class prefix handling for broad buckets when we don't care about the subcode.
    const cls = sqlstate.slice(0, 2);
    // 08 — connection_exception → UNAVAILABLE
    if (cls === '08')
      return throwInfra('UNAVAILABLE', { sqlstate, class: cls });
    // 53 — insufficient_resources → RESOURCE_EXHAUSTED
    if (cls === '53')
      return throwInfra('RESOURCE_EXHAUSTED', { sqlstate, class: cls });
    // 58 — system_error → UNAVAILABLE (treat as infra illness)
    if (cls === '58')
      return throwInfra('UNAVAILABLE', { sqlstate, class: cls });
    // 25 — invalid_transaction_state → INTEGRATION (usually client misuse of tx API)
    if (cls === '25')
      return throwInfra('INTEGRATION', { sqlstate, class: cls });

    // Message fallbacks when the driver forgets the code.
    if (
      /statement timeout|canceling statement due to statement timeout/i.test(
        message,
      )
    ) {
      return throwInfra('TIMEOUT', { message: message });
    }
    if (/terminating connection|server closed the connection/i.test(message)) {
      return throwInfra('UNAVAILABLE', { message: message });
    }

    // Unknown PG failure → INTEGRATION (glue/config/driver), not UNAVAILABLE.
    return throwInfra('INTEGRATION', {
      sqlstate: sqlstate || 'unknown',
      message: message,
      table,
      column,
    });
  }

  // 3) Non-QueryFailedError with timeout/connection smell
  const message = String(error['message'] ?? '');
  if (/timeout/i.test(message)) return throwInfra('TIMEOUT', { message });
  if (/connection.*(closed|lost|refused)/i.test(message))
    return throwInfra('UNAVAILABLE', { message });

  // 4) Last resort — INTEGRATION (don’t lie with a fake “timeout”)
  return throwInfra('INTEGRATION', { message });
}
