import { VECTOR_DIMENSIONS, normalizeTransaction } from './normalize.js';
import { createTopKResult, quantizeVector, topKBucketSearch } from './vector-search.js';
import { referenceIndex } from '../data/reference-index.js';
import type { FraudScoreRequest, FraudScoreResponse, TransactionPayload } from '../types/transaction.js';

const TOP_K = 5;
const FRAUD_THRESHOLD = 0.6;

// Node.js eh single-threaded e scoreTransaction eh sincrono, entao podemos
// reutilizar os mesmos buffers entre requests sem race condition.
const QUERY_VECTOR = new Float32Array(VECTOR_DIMENSIONS);
const QUANTIZED_QUERY = new Uint8Array(VECTOR_DIMENSIONS);
const TOP_K_RESULT = createTopKResult(TOP_K);

export function scoreTransaction(request: FraudScoreRequest): FraudScoreResponse {
  const payload = getTransactionPayload(request);

  if (payload === null) {
    throw new Error('Invalid fraud-score payload');
  }

  normalizeTransaction(payload, QUERY_VECTOR);
  quantizeVector(QUERY_VECTOR, QUANTIZED_QUERY);
  const neighbors = topKBucketSearch(referenceIndex, QUANTIZED_QUERY, TOP_K, TOP_K_RESULT);
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

function calculateFraudScore(labels: Uint8Array, neighbors: ReturnType<typeof createTopKResult>): number {
  if (neighbors.found === 0) {
    return 0;
  }

  let frauds = 0;
  const found = neighbors.found;
  const indexes = neighbors.indexes;

  for (let index = 0; index < found; index += 1) {
    if (labels[indexes[index] as number] === 1) {
      frauds += 1;
    }
  }

  return frauds / TOP_K;
}
