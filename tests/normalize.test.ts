import { describe, expect, it } from 'vitest';
import { normalizeTransaction, VECTOR_DIMENSIONS } from '../src/core/normalize.js';
import { makeTransaction } from './fixtures.js';

describe('normalizeTransaction', () => {
  it('normalizes the documented legitimate transaction into 14 dimensions', async () => {
    const output = new Float32Array(VECTOR_DIMENSIONS);

    await normalizeTransaction(makeTransaction(), output);

    expect(Array.from(output)).toHaveLength(14);
    expect(output[0]).toBeCloseTo(0.004112, 6);
    expect(output[1]).toBeCloseTo(2 / 12, 6);
    expect(output[2]).toBeCloseTo(0.05, 6);
    expect(output[3]).toBeCloseTo(18 / 23, 6);
    expect(output[4]).toBeCloseTo(2 / 6, 6);
    expect(output[5]).toBe(-1);
    expect(output[6]).toBe(-1);
    expect(output[7]).toBeCloseTo(0.0292331036, 6);
    expect(output[8]).toBeCloseTo(0.15, 6);
    expect(output[9]).toBe(0);
    expect(output[10]).toBe(1);
    expect(output[11]).toBe(0);
    expect(output[12]).toBeCloseTo(0.15, 6);
    expect(output[13]).toBeCloseTo(0.006025, 6);
  });

  it('uses last transaction fields when present', async () => {
    const output = new Float32Array(VECTOR_DIMENSIONS);
    const payload = makeTransaction({
      transaction: {
        amount: 100,
        installments: 1,
        requested_at: '2026-03-11T19:45:53Z',
      },
      last_transaction: {
        timestamp: '2026-03-11T18:15:53Z',
        km_from_current: 250,
      },
    });

    await normalizeTransaction(payload, output);

    expect(output[5]).toBeCloseTo(90 / 1440, 6);
    expect(output[6]).toBeCloseTo(0.25, 6);
  });

  it('clamps high-risk numeric dimensions to one', async () => {
    const output = new Float32Array(VECTOR_DIMENSIONS);

    await normalizeTransaction(
      makeTransaction({
        transaction: {
          amount: 50000,
          installments: 99,
          requested_at: '2026-03-14T05:15:12Z',
        },
        customer: {
          avg_amount: 1,
          tx_count_24h: 99,
          known_merchants: [],
        },
        merchant: {
          id: 'MERC-999',
          mcc: '7995',
          avg_amount: 50000,
        },
        terminal: {
          is_online: true,
          card_present: false,
          km_from_home: 5000,
        },
      }),
      output,
    );

    expect(output[0]).toBe(1);
    expect(output[1]).toBe(1);
    expect(output[2]).toBe(1);
    expect(output[7]).toBe(1);
    expect(output[8]).toBe(1);
    expect(output[9]).toBe(1);
    expect(output[10]).toBe(0);
    expect(output[11]).toBe(1);
    expect(output[12]).toBeCloseTo(0.85, 6);
    expect(output[13]).toBe(1);
  });

  it('uses default MCC risk and handles invalid dates without NaN', async () => {
    const output = new Float32Array(VECTOR_DIMENSIONS);

    await normalizeTransaction(
      makeTransaction({
        transaction: {
          amount: 10,
          installments: 1,
          requested_at: 'not-a-date',
        },
        merchant: {
          id: 'MERC-016',
          mcc: '0000',
          avg_amount: 10,
        },
        last_transaction: {
          timestamp: 'also-not-a-date',
          km_from_current: 10,
        },
      }),
      output,
    );

    expect(output[3]).toBe(0);
    expect(output[4]).toBe(0);
    expect(output[5]).toBe(0);
    expect(output[6]).toBeCloseTo(0.01, 6);
    expect(output[12]).toBeCloseTo(0.5, 6);
    expect(Array.from(output).every((value) => Number.isFinite(value))).toBe(true);
  });

  it('treats non-positive customer average as maximum amount-vs-average risk', async () => {
    const output = new Float32Array(VECTOR_DIMENSIONS);

    await normalizeTransaction(
      makeTransaction({
        customer: {
          avg_amount: 0,
          tx_count_24h: 1,
          known_merchants: ['MERC-016'],
        },
      }),
      output,
    );

    expect(output[2]).toBe(1);
  });
});
