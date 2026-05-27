import type { TransactionPayload } from '../src/types/transaction.js';

export function makeTransaction(
  overrides: Partial<TransactionPayload> = {},
): TransactionPayload {
  const base: TransactionPayload = {
    id: 'tx-1329056812',
    transaction: {
      amount: 41.12,
      installments: 2,
      requested_at: '2026-03-11T18:45:53Z',
    },
    customer: {
      avg_amount: 82.24,
      tx_count_24h: 3,
      known_merchants: ['MERC-003', 'MERC-016'],
    },
    merchant: {
      id: 'MERC-016',
      mcc: '5411',
      avg_amount: 60.25,
    },
    terminal: {
      is_online: false,
      card_present: true,
      km_from_home: 29.2331036248,
    },
    last_transaction: null,
  };

  return {
    ...base,
    ...overrides,
    transaction: {
      ...base.transaction,
      ...overrides.transaction,
    },
    customer: {
      ...base.customer,
      ...overrides.customer,
    },
    merchant: {
      ...base.merchant,
      ...overrides.merchant,
    },
    terminal: {
      ...base.terminal,
      ...overrides.terminal,
    },
  };
}
