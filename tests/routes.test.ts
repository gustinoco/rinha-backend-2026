import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { makeTransaction } from './fixtures.js';

let app: FastifyInstance | null = null;

afterEach(async () => {
  if (app !== null) {
    await app.close();
    app = null;
  }
});

describe('HTTP routes', () => {
  it('responds ready', async () => {
    app = buildServer();

    const response = await app.inject({
      method: 'GET',
      url: '/ready',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it('scores a valid fraud-score payload', async () => {
    app = buildServer();

    const response = await app.inject({
      method: 'POST',
      url: '/fraud-score',
      headers: {
        'content-type': 'application/json',
      },
      payload: JSON.stringify([makeTransaction()]),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      approved: true,
    });
    expect(response.json().fraud_score).toBeLessThan(0.6);
  });

  it('returns 400 for empty fraud-score arrays', async () => {
    app = buildServer();

    const response = await app.inject({
      method: 'POST',
      url: '/fraud-score',
      headers: {
        'content-type': 'application/json',
      },
      payload: '[]',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'invalid_payload',
      message: 'fraud-score requires a transaction payload',
    });
  });

  it('returns 400 for invalid JSON bodies', async () => {
    app = buildServer();

    const response = await app.inject({
      method: 'POST',
      url: '/fraud-score',
      headers: {
        'content-type': 'application/json',
      },
      payload: '{',
    });

    expect(response.statusCode).toBe(400);
  });
});
