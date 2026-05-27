import { VECTOR_DIMENSIONS, normalizeTransaction } from './normalize.js';
import { createTopKResult, quantizeVector, topKBucketSearch } from './vector-search.js';
import { referenceIndex } from '../data/reference-index.js';
import type { FraudScoreRequest, FraudScoreResponse, TransactionPayload } from '../types/transaction.js';

const TOP_K = 5;
const FRAUD_THRESHOLD = 0.6;

export function scoreTransaction(request: FraudScoreRequest): FraudScoreResponse {
  const payload = getTransactionPayload(request);

  if (payload === null) {
    throw new Error('Invalid fraud-score payload');
  }

  const queryVector = new Float32Array(VECTOR_DIMENSIONS);
  const quantizedQueryVector = new Uint8Array(VECTOR_DIMENSIONS);
  const topKResult = createTopKResult(TOP_K);

  normalizeTransaction(payload, queryVector);
  quantizeVector(queryVector, quantizedQueryVector);
  const neighbors = topKBucketSearch(referenceIndex, quantizedQueryVector, TOP_K, topKResult);
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

  for (let index = 0; index < neighbors.found; index += 1) {
    const neighborIndex = neighbors.indexes[index] as number;

    if (labels[neighborIndex] === 1) {
      frauds += 1;
    }
  }

  return frauds / TOP_K;
}
