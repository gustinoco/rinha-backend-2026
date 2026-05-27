import Fastify from 'fastify';
import { registerFraudRoutes } from './routes/fraud.js';
import { registerReadyRoute } from './routes/ready.js';

const DEFAULT_PORT = 8080;
const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024;
const HOST = '0.0.0.0';

export function buildServer() {
  const bodyLimit = Number.parseInt(
    process.env.BODY_LIMIT_BYTES ?? `${DEFAULT_BODY_LIMIT_BYTES}`,
    10,
  );

  const app = Fastify({
    logger: false,
    bodyLimit,
  });

  app.removeContentTypeParser('application/json');
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, body, done) => {
      try {
        // Fastify already keeps the parser lean here: one JSON.parse per request,
        // no validation layer, decorators, reflection, or extra object copies.
        done(null, JSON.parse(body as string));
      } catch (error) {
        const parseError = error as Error & { statusCode?: number };
        parseError.statusCode = 400;
        done(parseError);
      }
    },
  );

  registerReadyRoute(app);
  registerFraudRoutes(app);

  return app;
}

const port = Number.parseInt(process.env.PORT ?? `${DEFAULT_PORT}`, 10);

if (process.env.VITEST !== 'true') {
  const server = buildServer();

  try {
    await server.listen({ host: HOST, port });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  }
}
