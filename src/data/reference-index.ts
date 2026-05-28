import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import hnsw from 'hnswlib-node';
import { VECTOR_DIMENSIONS } from '../core/normalize.js';

const { HierarchicalNSW } = hnsw;

const HNSW_FILE = 'reference-hnsw.dat';
const LABELS_FILE = 'reference-labels.u8';

// ef controla quao "fundo" o HNSW navega no grafo na busca.
// Com M=16 (grafo denso) ef=100 ja entrega recall ~99% em <0.1ms.
const HNSW_EF_SEARCH = 100;

export type KnnResult = {
  neighbors: readonly number[];
  distances: readonly number[];
};

export type SearchIndex = {
  readonly labels: Uint8Array;
  search(query: number[], topK: number): KnnResult;
};

export const referenceIndex: SearchIndex = loadReferenceIndex();

function loadReferenceIndex(): SearchIndex {
  if (process.env.VITEST === 'true') {
    return createFallbackIndex();
  }

  const processedDir = join(process.cwd(), 'data', 'processed');
  const hnswPath = join(processedDir, HNSW_FILE);
  const labelsPath = join(processedDir, LABELS_FILE);

  if (!existsSync(hnswPath) || !existsSync(labelsPath)) {
    process.stderr.write(`WARN: HNSW files missing, using fallback\n`);
    return createFallbackIndex();
  }

  const labels = new Uint8Array(readFileSync(labelsPath));
  const index = new HierarchicalNSW('l2', VECTOR_DIMENSIONS);
  index.readIndexSync(hnswPath);
  index.setEf(HNSW_EF_SEARCH);

  return {
    labels,
    search(query, topK) {
      return index.searchKnn(query, topK) as KnnResult;
    },
  };
}

// Fallback brute-force pra rodar testes sem precisar de arquivo HNSW.
// 6 vetores legit/fraud que cobrem os casos basicos.
function createFallbackIndex(): SearchIndex {
  const refs: ReadonlyArray<{ vector: number[]; label: number }> = [
    { vector: [0.004, 0.167, 0.05, 0.783, 0.333, -1, -1, 0.029, 0.15, 0, 1, 0, 0.15, 0.006], label: 0 },
    { vector: [0.004, 0.167, 0.049, 0.78, 0.333, -1, -1, 0.03, 0.1, 0, 1, 0, 0.15, 0.006], label: 0 },
    { vector: [0.003, 0.083, 0.052, 0.788, 0.333, -1, -1, 0.026, 0.2, 0, 1, 0, 0.15, 0.006], label: 0 },
    { vector: [0.951, 0.833, 1, 0.217, 0.833, -1, -1, 0.952, 1, 0, 1, 1, 0.75, 0.005], label: 1 },
    { vector: [0.93, 0.833, 1, 0.21, 0.833, -1, -1, 0.94, 1, 0, 1, 1, 0.75, 0.006], label: 1 },
    { vector: [0.98, 0.917, 1, 0.263, 0.833, -1, -1, 0.97, 0.95, 0, 1, 1, 0.75, 0.005], label: 1 },
  ];

  const labels = new Uint8Array(refs.map((r) => r.label));

  return {
    labels,
    search(query, topK) {
      const distances: { dist: number; idx: number }[] = [];
      for (let i = 0; i < refs.length; i += 1) {
        const v = refs[i]!.vector;
        let d = 0;
        for (let k = 0; k < VECTOR_DIMENSIONS; k += 1) {
          const diff = (v[k] as number) - (query[k] as number);
          d += diff * diff;
        }
        distances.push({ dist: d, idx: i });
      }
      distances.sort((a, b) => a.dist - b.dist);
      const k = Math.min(topK, distances.length);
      const neighbors: number[] = [];
      const dists: number[] = [];
      for (let i = 0; i < k; i += 1) {
        neighbors.push(distances[i]!.idx);
        dists.push(distances[i]!.dist);
      }
      return { neighbors, distances: dists };
    },
  };
}
