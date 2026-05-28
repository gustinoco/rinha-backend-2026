import Fastify from 'fastify';
import { registerFraudRoutes } from './routes/fraud.js';
import { registerReadyRoute } from './routes/ready.js';
import { countFraudNeighbors } from './core/score.js';
import type { TransactionPayload } from './types/transaction.js';

const DEFAULT_PORT = 8080;
const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024;
const HOST = '0.0.0.0';
const WARMUP_ITERATIONS = 2000;

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

/**
 * Pre-aquece o JIT do V8 chamando o hot path com payload sintetico.
 * Sem isso, as primeiras ~500 requests pagam custo de compilacao on-demand,
 * o que vira pico de p99. 2000 iteracoes garantem que todas as funcoes
 * importantes ja estao em TurboFan-compiled code antes do listen().
 */
function warmupJit(): void {
  const dummy: TransactionPayload = {
    id: 'warmup',
    transaction: { amount: 100, installments: 1, requested_at: '2026-03-11T18:45:53Z' },
    customer: { avg_amount: 200, tx_count_24h: 2, known_merchants: ['M-1', 'M-2'] },
    merchant: { id: 'M-1', mcc: '5411', avg_amount: 150 },
    terminal: { is_online: false, card_present: true, km_from_home: 12.5 },
    last_transaction: { timestamp: '2026-03-11T14:00:00Z', km_from_current: 8.2 },
  };
  for (let i = 0; i < WARMUP_ITERATIONS; i += 1) {
    countFraudNeighbors(dummy);
  }
}

const port = Number.parseInt(process.env.PORT ?? `${DEFAULT_PORT}`, 10);

if (process.env.VITEST !== 'true') {
  const t0 = Date.now();
  warmupJit();
  process.stdout.write(`jit warmup: ${WARMUP_ITERATIONS} iters in ${Date.now() - t0}ms\n`);

  const server = buildServer();

  try {
    await server.listen({ host: HOST, port });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  }
}
