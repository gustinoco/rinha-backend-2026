import type { FastifyInstance } from 'fastify';

export function registerReadyRoute(app: FastifyInstance): void {
  app.get('/ready', async () => ({ ok: true }));
}
