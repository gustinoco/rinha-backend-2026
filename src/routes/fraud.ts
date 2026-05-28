import type { FastifyInstance } from 'fastify';
import { countFraudNeighbors, TOP_K } from '../core/score.js';
import type { FraudScoreRequest } from '../types/transaction.js';

// Pre-built JSON strings indexados pelo count de fraudes (0..TOP_K).
// Com TOP_K=5, fraud_score so pode ser 0, 0.2, 0.4, 0.6, 0.8 ou 1 — 6 valores.
// Threshold de aprovacao eh frauds >= 3 (>=0.6).
//
// Eliminamos JSON.stringify por request: 0.05-0.1ms economizados no hot path,
// e mais importante, zero allocations → menos pressao no GC do V8.
const RESPONSES: readonly string[] = [
  '{"approved":true,"fraud_score":0}',     // 0/5
  '{"approved":true,"fraud_score":0.2}',   // 1/5
  '{"approved":true,"fraud_score":0.4}',   // 2/5
  '{"approved":false,"fraud_score":0.6}',  // 3/5
  '{"approved":false,"fraud_score":0.8}',  // 4/5
  '{"approved":false,"fraud_score":1}',    // 5/5
];

if (RESPONSES.length !== TOP_K + 1) {
  throw new Error(`RESPONSES length mismatch: ${RESPONSES.length} vs ${TOP_K + 1}`);
}

const FALLBACK_RESPONSE = RESPONSES[0] as string;
const JSON_TYPE = 'application/json; charset=utf-8';

export function registerFraudRoutes(app: FastifyInstance): void {
  app.post<{ Body: FraudScoreRequest }>('/fraud-score', (request, reply) => {
    try {
      const count = countFraudNeighbors(request.body);
      reply.type(JSON_TYPE).send(RESPONSES[count] ?? FALLBACK_RESPONSE);
    } catch {
      reply.type(JSON_TYPE).send(FALLBACK_RESPONSE);
    }
  });
}
