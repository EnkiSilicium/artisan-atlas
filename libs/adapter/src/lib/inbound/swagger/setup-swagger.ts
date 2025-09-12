/* eslint-disable */
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { extractBoolEnv } from 'shared-kernel';

import type { INestApplication } from '@nestjs/common';

function registerBundledSwaggerAssets(app: INestApplication) {
  const adapter = app.getHttpAdapter();
  const root = join(process.cwd(), 'public/swagger');

  const send = (res: any, contentType: string, fileName: string) => {
    const p = join(root, fileName);
    if (!existsSync(p)) {
      if (typeof res.code === 'function') res.code(404);
      else if (typeof res.status === 'function') res.status(404);
      return typeof res.send === 'function'
        ? res.send('Not found')
        : res.end('Not found');
    }
    const buf = readFileSync(p);
    // Fastify style
    if (typeof res.type === 'function' && typeof res.send === 'function')
      return res.type(contentType).send(buf);
    // Express style
    if (typeof res.header === 'function')
      res.header('content-type', contentType);
    else if (typeof res.setHeader === 'function')
      res.setHeader('content-type', contentType);
    return typeof res.send === 'function' ? res.send(buf) : res.end(buf);
  };

  // Absolute paths so global prefix (e.g. /api) does not matter
  adapter.get('/swagger/swagger-ui.css', (_req: any, res: any) =>
    send(res, 'text/css; charset=utf-8', 'swagger-ui.css'),
  );
  adapter.get('/swagger/swagger-ui-bundle.js', (_req: any, res: any) =>
    send(res, 'application/javascript; charset=utf-8', 'swagger-ui-bundle.js'),
  );
  adapter.get(
    '/swagger/swagger-ui-standalone-preset.js',
    (_req: any, res: any) =>
      send(
        res,
        'application/javascript; charset=utf-8',
        'swagger-ui-standalone-preset.js',
      ),
  );
  adapter.get('/swagger/favicon-32x32.png', (_req: any, res: any) =>
    send(res, 'image/png', 'favicon-32x32.png'),
  );
  adapter.get('/swagger/favicon-16x16.png', (_req: any, res: any) =>
    send(res, 'image/png', 'favicon-16x16.png'),
  );
}

export function setupSwagger(
  app: INestApplication,
  {
    title,
    version = '1.0.0',
    path = 'docs',
  }: { title: string; version?: string; path?: string },
) {
  const cfg = new DocumentBuilder()
    .setTitle(title)
    .setVersion(version)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        in: 'header',
        name: 'Authorization',
        description: 'Paste: Bearer <your-JWT>',
      },
      'JWT',
    )
    .build();
  const doc = SwaggerModule.createDocument(app, cfg, { deepScanRoutes: true });

  // Optional: emit OpenAPI JSON to disk
  if (process.argv.includes('--emit-openapi')) {
    const outDir = join(process.cwd(), 'openapi');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, `${title}.${version}.json`),
      JSON.stringify(doc, null, 2),
    );
  }

  const bundled = extractBoolEnv(process.env.BUNDLED_SWAGGER);

  // Serve docs JSON at an absolute path (prefix-proof)
  const adapter = app.getHttpAdapter();
  adapter.get('/docs-json', (_req: any, res: any) => {
    const payload = JSON.stringify(doc);
    if (typeof res.type === 'function' && typeof res.send === 'function') {
      return res.type('application/json; charset=utf-8').send(payload);
    }
    if (typeof res.setHeader === 'function')
      res.setHeader('content-type', 'application/json; charset=utf-8');
    return typeof res.send === 'function'
      ? res.send(payload)
      : res.end(payload);
  });

  // If bundled, expose the on-disk assets from the image
  if (bundled) registerBundledSwaggerAssets(app);

  // Render the Swagger page; in bundled mode, tell it where to fetch assets + JSON
  SwaggerModule.setup(path, app, doc, {
    customSiteTitle: title,
    ...(bundled
      ? {
        customCssUrl: '/swagger/swagger-ui.css',
        customJs: [
          '/swagger/swagger-ui-bundle.js',
          '/swagger/swagger-ui-standalone-preset.js',
        ],
        swaggerOptions: {
          url: '/docs-json', // absolute; not affected by global prefix
          persistAuthorization: true,
          layout: 'BaseLayout',
        },
      }
      : {
        swaggerOptions: { persistAuthorization: true, layout: 'BaseLayout' },
      }),
  });
}
