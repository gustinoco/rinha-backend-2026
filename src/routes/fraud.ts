import type { FastifyInstance } from 'fastify';
import { getTransactionPayload, scoreTransaction } from '../core/score.js';
import type { FraudScoreRequest } from '../types/transaction.js';

export function registerFraudRoutes(app: FastifyInstance): void {
  app.post<{ Body: FraudScoreRequest }>('/fraud-score', async (request, reply) => {
    if (getTransactionPayload(request.body) === null) {
      return reply.code(400).send({
        error: 'invalid_payload',
        message: 'fraud-score requires a transaction payload',
      });
    }

    try {
      return await scoreTransaction(request.body);
    } catch {
      return {
        approved: true,
        fraud_score: 0,
      };
    }
  });
}
