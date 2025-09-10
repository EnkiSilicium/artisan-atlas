import { makeWinstonOptions } from 'observability';

import type { LoggerFactoryOverrides } from 'observability';

const orderLoggerFactoryOverrides: LoggerFactoryOverrides = {
  serviceName: 'order-read',
  production: true
};
export const orderReadWinstonConfig = makeWinstonOptions(
  orderLoggerFactoryOverrides,
  
);
