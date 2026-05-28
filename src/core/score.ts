import { VECTOR_DIMENSIONS, normalizeTransaction } from './normalize.js';
import { referenceIndex } from '../data/reference-index.js';
import type { FraudScoreRequest, FraudScoreResponse, TransactionPayload } from '../types/transaction.js';

export const TOP_K = 5;
const FRAUD_THRESHOLD = 0.6;
// 3/5 = 0.6 → quando frauds >= 3, ja estamos no threshold. Comparar inteiro
// evita divisao por TOP_K + comparacao em float no hot path.
const FRAUD_THRESHOLD_COUNT = Math.ceil(FRAUD_THRESHOLD * TOP_K);

// Node.js eh single-threaded e scoreTransaction eh sincrono, entao podemos
// reutilizar os mesmos buffers entre requests sem race condition.
const QUERY_VECTOR = new Float32Array(VECTOR_DIMENSIONS);
// hnswlib-node aceita number[] (array regular) como input.
const QUERY_ARRAY = new Array<number>(VECTOR_DIMENSIONS);

/**
 * Hot path: retorna so o count de fraudes nos top-K vizinhos (0..K).
 * fraud.ts usa isso pra indexar uma tabela de responses pre-construidas,
 * eliminando JSON.stringify por request.
 */
export function countFraudNeighbors(request: FraudScoreRequest): number {
  const payload = getTransactionPayload(request);

  if (payload === null) {
    throw new Error('Invalid fraud-score payload');
  }

  normalizeTransaction(payload, QUERY_VECTOR);
  for (let i = 0; i < VECTOR_DIMENSIONS; i += 1) {
    QUERY_ARRAY[i] = QUERY_VECTOR[i] as number;
  }

  const { neighbors } = referenceIndex.search(QUERY_ARRAY, TOP_K);
  return countFrauds(referenceIndex.labels, neighbors);
}

/**
 * Wrapper para uso em testes e como API publica. Em runtime de prod, fraud.ts
 * chama countFraudNeighbors() diretamente.
 */
export function scoreTransaction(request: FraudScoreRequest): FraudScoreResponse {
  const frauds = countFraudNeighbors(request);
  return {
    approved: frauds < FRAUD_THRESHOLD_COUNT,
    fraud_score: frauds / TOP_K,
  };
}

export function getTransactionPayload(request: FraudScoreRequest): TransactionPayload | null {
  if (Array.isArray(request)) {
    return request[0] ?? null;
  }

  return request;
}

function countFrauds(labels: Uint8Array, neighbors: readonly number[]): number {
  const found = neighbors.length;
  if (found === 0) return 0;

  let frauds = 0;
  for (let i = 0; i < found; i += 1) {
    if (labels[neighbors[i] as number] === 1) {
      frauds += 1;
    }
  }
  return frauds;
}
