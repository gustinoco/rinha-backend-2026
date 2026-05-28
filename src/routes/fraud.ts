import type { FastifyInstance } from 'fastify';
import { scoreTransaction } from '../core/score.js';
import type { FraudScoreRequest } from '../types/transaction.js';

const FALLBACK_RESPONSE = { approved: true, fraud_score: 0 };

export function registerFraudRoutes(app: FastifyInstance): void {
  app.post<{ Body: FraudScoreRequest }>('/fraud-score', (request, reply) => {
    try {
      reply.send(scoreTransaction(request.body));
    } catch {
      reply.send(FALLBACK_RESPONSE);
    }
  });
}
