import { makeWinstonOptions } from 'observability';

import type { LoggerFactoryOverrides } from 'observability';

const orderLoggerFactoryOverrides: LoggerFactoryOverrides = {
  serviceName: 'order-workflow',
  production: true,
};
export const orderWorkflowWinstonConfig = makeWinstonOptions(
  orderLoggerFactoryOverrides,
);
