import { VECTOR_DIMENSIONS, normalizeTransaction } from './normalize.js';
import { referenceIndex } from '../data/reference-index.js';
import type { FraudScoreRequest, FraudScoreResponse, TransactionPayload } from '../types/transaction.js';

const TOP_K = 5;
const FRAUD_THRESHOLD = 0.6;

// Node.js eh single-threaded e scoreTransaction eh sincrono, entao podemos
// reutilizar os mesmos buffers entre requests sem race condition.
const QUERY_VECTOR = new Float32Array(VECTOR_DIMENSIONS);
// hnswlib-node aceita number[] (array regular) como input.
const QUERY_ARRAY = new Array<number>(VECTOR_DIMENSIONS);

export function scoreTransaction(request: FraudScoreRequest): FraudScoreResponse {
  const payload = getTransactionPayload(request);

  if (payload === null) {
    throw new Error('Invalid fraud-score payload');
  }

  normalizeTransaction(payload, QUERY_VECTOR);
  for (let i = 0; i < VECTOR_DIMENSIONS; i += 1) {
    QUERY_ARRAY[i] = QUERY_VECTOR[i] as number;
  }

  const { neighbors } = referenceIndex.search(QUERY_ARRAY, TOP_K);
  const fraudScore = calculateFraudScore(referenceIndex.labels, neighbors);

  return {
    approved: fraudScore < FRAUD_THRESHOLD,
    fraud_score: fraudScore,
  };
}

export function getTransactionPayload(request: FraudScoreRequest): TransactionPayload | null {
  if (Array.isArray(request)) {
    return request[0] ?? null;
  }

  return request;
}

function calculateFraudScore(labels: Uint8Array, neighbors: readonly number[]): number {
  const found = neighbors.length;
  if (found === 0) return 0;

  let frauds = 0;
  for (let i = 0; i < found; i += 1) {
    if (labels[neighbors[i] as number] === 1) {
      frauds += 1;
    }
  }

  return frauds / TOP_K;
}
