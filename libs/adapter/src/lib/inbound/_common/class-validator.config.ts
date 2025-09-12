import type { ValidationPipeOptions } from '@nestjs/common';

export const validator: ValidationPipeOptions = {
  transform: true,
  whitelist: false,
  forbidNonWhitelisted: false,
  forbidUnknownValues: false,
  skipNullProperties: true,
  skipUndefinedProperties: true,
  skipMissingProperties: true,
  validationError: { target: false, value: false },
};
