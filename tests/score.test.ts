import { describe, expect, it } from 'vitest';
import { getTransactionPayload, scoreTransaction } from '../src/core/score.js';
import { makeTransaction } from './fixtures.js';

describe('getTransactionPayload', () => {
  it('accepts a single transaction object', () => {
    const payload = makeTransaction();

    expect(getTransactionPayload(payload)).toBe(payload);
  });

  it('accepts the first transaction from an array', () => {
    const first = makeTransaction({ id: 'first' });
    const second = makeTransaction({ id: 'second' });

    expect(getTransactionPayload([first, second])).toBe(first);
  });

  it('rejects empty arrays', () => {
    expect(getTransactionPayload([])).toBeNull();
  });
});

describe('scoreTransaction', () => {
  it('approves low-risk transactions with score below the threshold', async () => {
    const response = await scoreTransaction([makeTransaction()]);

    expect(response.approved).toBe(true);
    expect(response.fraud_score).toBeLessThan(0.6);
  });

  it('rejects transactions at the 0.6 threshold', async () => {
    const response = await scoreTransaction(
      makeTransaction({
        id: 'tx-3330991687',
        transaction: {
          amount: 9505.97,
          installments: 10,
          requested_at: '2026-03-14T05:15:12Z',
        },
        customer: {
          avg_amount: 81.28,
          tx_count_24h: 20,
          known_merchants: ['MERC-008', 'MERC-007', 'MERC-005'],
        },
        merchant: {
          id: 'MERC-068',
          mcc: '7802',
          avg_amount: 54.86,
        },
        terminal: {
          is_online: false,
          card_present: true,
          km_from_home: 952.27,
        },
        last_transaction: null,
      }),
    );

    expect(response.fraud_score).toBeGreaterThanOrEqual(0.6);
    expect(response.approved).toBe(false);
  });

  it('throws instead of approving invalid empty input', async () => {
    await expect(scoreTransaction([])).rejects.toThrow('Invalid fraud-score payload');
  });
});
