import { VECTOR_DIMENSIONS, normalizeTransaction } from './normalize.js';
import { createTopKResult, quantizeVector, topKSearch } from './vector-search.js';
import { referenceIndex } from '../data/reference-index.js';
import type { FraudScoreRequest, FraudScoreResponse, TransactionPayload } from '../types/transaction.js';

const TOP_K = 5;
const FRAUD_THRESHOLD = 0.6;

export async function scoreTransaction(request: FraudScoreRequest): Promise<FraudScoreResponse> {
  const payload = getTransactionPayload(request);

  if (payload === null) {
    throw new Error('Invalid fraud-score payload');
  }

  const queryVector = new Float32Array(VECTOR_DIMENSIONS);
  const quantizedQueryVector = new Uint16Array(VECTOR_DIMENSIONS);
  const topKResult = createTopKResult(TOP_K);

  await normalizeTransaction(payload, queryVector);
  await quantizeVector(queryVector, quantizedQueryVector);
  const neighbors = await topKSearch(referenceIndex, quantizedQueryVector, TOP_K, topKResult);
  const fraudScore = await calculateFraudScore(referenceIndex.labels, neighbors);

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

async function calculateFraudScore(labels: Uint8Array, neighbors: ReturnType<typeof createTopKResult>): Promise<number> {
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
