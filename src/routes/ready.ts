import type { FastifyInstance } from 'fastify';

const READY_RESPONSE = { ok: true };

export function registerReadyRoute(app: FastifyInstance): void {
  app.get('/ready', (_request, reply) => {
    reply.send(READY_RESPONSE);
  });
}
