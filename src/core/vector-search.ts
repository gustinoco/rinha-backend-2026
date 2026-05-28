export const QUANTIZED_ZERO = 128;
export const QUANTIZED_SCALE = 127;

export type VectorSearchIndex = {
  readonly dimensions: number;
  readonly count: number;
  readonly vectors: Uint8Array;
  readonly labels: Uint8Array;
  readonly bucketHeads?: Uint32Array;
  readonly bucketNext?: Uint32Array;
};

export type TopKResult = {
  readonly indexes: Int32Array;
  readonly distances: Float64Array;
  found: number;
};

const EMPTY_LINK = 0xffffffff;
const BUCKET_BITS = 4;
const BUCKET_MASK = 0x0f;
export const BUCKET_COUNT = 1 << (BUCKET_BITS * 5);

export function createVectorSearchIndex(dimensions: number, count: number): VectorSearchIndex {
  if (dimensions <= 0 || count < 0) {
    throw new Error('Invalid vector index dimensions');
  }

  return {
    dimensions,
    count,
    vectors: new Uint8Array(dimensions * count),
    labels: new Uint8Array(count),
  };
}

export function createVectorSearchIndexFrom(
  dimensions: number,
  vectors: Uint8Array,
  labels: Uint8Array,
  bucketHeads?: Uint32Array,
  bucketNext?: Uint32Array,
): VectorSearchIndex {
  if (vectors.length % dimensions !== 0) {
    throw new Error('Vector data length must be divisible by dimensions');
  }

  const count = vectors.length / dimensions;

  if (labels.length !== count) {
    throw new Error('Labels length must match vector count');
  }

  if (bucketHeads !== undefined && bucketHeads.length !== BUCKET_COUNT) {
    throw new Error('Bucket heads length must match bucket count');
  }

  if (bucketNext !== undefined && bucketNext.length !== count) {
    throw new Error('Bucket next length must match vector count');
  }

  if (bucketHeads !== undefined && bucketNext !== undefined) {
    return {
      dimensions,
      count,
      vectors,
      labels,
      bucketHeads,
      bucketNext,
    };
  }

  return {
    dimensions,
    count,
    vectors,
    labels,
  };
}

export function quantizeVector(input: Float32Array, output: Uint8Array): Uint8Array {
  const length = input.length;
  for (let index = 0; index < length; index += 1) {
    output[index] = quantizeValue(input[index] as number);
  }
  return output;
}

export function quantizeValue(value: number): number {
  if (value < 0) return 0;
  if (value >= 1) return 255;
  return QUANTIZED_ZERO + Math.round(value * QUANTIZED_SCALE);
}

export function topKSearch(
  index: VectorSearchIndex,
  query: Uint8Array,
  topK: number,
  result: TopKResult,
): TopKResult {
  const limit = Math.min(topK, result.indexes.length, result.distances.length);
  resetTopKResult(limit, result);

  if (limit === 0 || query.length < index.dimensions) {
    return result;
  }

  const vectors = index.vectors;
  const dim = index.dimensions;
  const count = index.count;
  const indexes = result.indexes;
  const distances = result.distances;

  for (let vectorIndex = 0; vectorIndex < count; vectorIndex += 1) {
    const maxDistance = result.found < limit ? Number.POSITIVE_INFINITY : (distances[limit - 1] as number);
    const vectorOffset = vectorIndex * dim;
    let distance = 0;

    for (let dimension = 0; dimension < dim; dimension += 1) {
      const diff = (vectors[vectorOffset + dimension] as number) - (query[dimension] as number);
      distance += diff * diff;
      if (distance >= maxDistance) break;
    }

    if (result.found < limit) {
      insertTopK(indexes, distances, result.found, vectorIndex, distance);
      result.found += 1;
    } else if (distance < (distances[limit - 1] as number)) {
      insertTopK(indexes, distances, limit - 1, vectorIndex, distance);
    }
  }

  return result;
}

export function topKBucketSearch(
  index: VectorSearchIndex,
  query: Uint8Array,
  topK: number,
  result: TopKResult,
): TopKResult {
  const limit = Math.min(topK, result.indexes.length, result.distances.length);
  resetTopKResult(limit, result);

  if (limit === 0 || query.length < index.dimensions) {
    return result;
  }

  const heads = index.bucketHeads;
  const next = index.bucketNext;

  if (heads === undefined || next === undefined) {
    return topKSearch(index, query, topK, result);
  }

  const vectors = index.vectors;
  const dim = index.dimensions;
  const indexes = result.indexes;
  const distances = result.distances;

  // Indexa dims com distribuicao uniforme pra manter bucket sizes balanceados:
  // 0=amount, 3=hour (uniforme 0-23), 4=day (uniforme 0-6), 5=minutes, 8=tx_count.
  const q0 = bucketNibble(query[0] as number);
  const q3 = bucketNibble(query[3] as number);
  const q4 = bucketNibble(query[4] as number);
  const q5 = bucketNibble(query[5] as number);
  const q8 = bucketNibble(query[8] as number);

  // Loop manual desenrolado: sempre varre radius 0 e 1 (mesmo que ja tenha
  // 5 vizinhos em r0), porque um vizinho real mais proximo pode estar em r1.
  // Radius 2 so se ainda nao tem 5 candidatos.
  for (let radius = 0; radius <= 2; radius += 1) {
    if (radius >= 2 && result.found >= limit) break;

    const from0 = q0 > radius ? q0 - radius : 0;
    const to0 = q0 + radius < BUCKET_MASK ? q0 + radius : BUCKET_MASK;
    const from3 = q3 > radius ? q3 - radius : 0;
    const to3 = q3 + radius < BUCKET_MASK ? q3 + radius : BUCKET_MASK;
    const from4 = q4 > radius ? q4 - radius : 0;
    const to4 = q4 + radius < BUCKET_MASK ? q4 + radius : BUCKET_MASK;
    const from5 = q5 > radius ? q5 - radius : 0;
    const to5 = q5 + radius < BUCKET_MASK ? q5 + radius : BUCKET_MASK;
    const from8 = q8 > radius ? q8 - radius : 0;
    const to8 = q8 + radius < BUCKET_MASK ? q8 + radius : BUCKET_MASK;

    for (let b0 = from0; b0 <= to0; b0 += 1) {
      const d0 = b0 - q0;
      const ad0 = d0 < 0 ? -d0 : d0;
      for (let b3 = from3; b3 <= to3; b3 += 1) {
        const d3 = b3 - q3;
        const ad3 = d3 < 0 ? -d3 : d3;
        const m03 = ad0 > ad3 ? ad0 : ad3;
        for (let b4 = from4; b4 <= to4; b4 += 1) {
          const d4 = b4 - q4;
          const ad4 = d4 < 0 ? -d4 : d4;
          const m034 = m03 > ad4 ? m03 : ad4;
          for (let b5 = from5; b5 <= to5; b5 += 1) {
            const d5 = b5 - q5;
            const ad5 = d5 < 0 ? -d5 : d5;
            const m0345 = m034 > ad5 ? m034 : ad5;
            for (let b8 = from8; b8 <= to8; b8 += 1) {
              const d8 = b8 - q8;
              const ad8 = d8 < 0 ? -d8 : d8;
              const shell = m0345 > ad8 ? m0345 : ad8;
              if (shell !== radius) continue;

              const bucketKey = b0 | (b3 << 4) | (b4 << 8) | (b5 << 12) | (b8 << 16);
              let vectorIndex = heads[bucketKey] as number;

              while (vectorIndex !== EMPTY_LINK) {
                const maxDistance =
                  result.found < limit ? Number.POSITIVE_INFINITY : (distances[limit - 1] as number);
                const vectorOffset = vectorIndex * dim;
                let distance = 0;

                // Inline distance com early exit
                for (let dimension = 0; dimension < dim; dimension += 1) {
                  const diff =
                    (vectors[vectorOffset + dimension] as number) - (query[dimension] as number);
                  distance += diff * diff;
                  if (distance >= maxDistance) break;
                }

                if (result.found < limit) {
                  insertTopK(indexes, distances, result.found, vectorIndex, distance);
                  result.found += 1;
                } else if (distance < (distances[limit - 1] as number)) {
                  insertTopK(indexes, distances, limit - 1, vectorIndex, distance);
                }

                vectorIndex = next[vectorIndex] as number;
              }
            }
          }
        }
      }
    }
  }

  return result;
}

export function createTopKResult(topK: number): TopKResult {
  return {
    indexes: new Int32Array(topK),
    distances: new Float64Array(topK),
    found: 0,
  };
}

function insertTopK(
  indexes: Int32Array,
  distances: Float64Array,
  startSlot: number,
  vectorIndex: number,
  distance: number,
): void {
  let slot = startSlot;
  while (slot > 0 && distance < (distances[slot - 1] as number)) {
    distances[slot] = distances[slot - 1] as number;
    indexes[slot] = indexes[slot - 1] as number;
    slot -= 1;
  }
  distances[slot] = distance;
  indexes[slot] = vectorIndex;
}

function resetTopKResult(limit: number, result: TopKResult): void {
  result.found = 0;
  const indexes = result.indexes;
  const distances = result.distances;
  for (let slot = 0; slot < limit; slot += 1) {
    indexes[slot] = -1;
    distances[slot] = Number.POSITIVE_INFINITY;
  }
}

export function bucketKey(vector: Uint8Array, offset: number): number {
  // Mesmas dims que em topKBucketSearch: [0, 3, 4, 5, 8].
  return (
    bucketNibble(vector[offset] as number) |
    (bucketNibble(vector[offset + 3] as number) << 4) |
    (bucketNibble(vector[offset + 4] as number) << 8) |
    (bucketNibble(vector[offset + 5] as number) << 12) |
    (bucketNibble(vector[offset + 8] as number) << 16)
  );
}

function bucketNibble(value: number): number {
  if (value === 0) return 0;
  // 16 bins (1..15 para values em [128,255], mais 0 reservado pra null).
  // `>>> 7` divide por 128. Para value=255: (127*15)>>>7 = 14, +1 = 15. Max = 15.
  return 1 + ((((value - QUANTIZED_ZERO) * 15) >>> 7) & 0x0f);
}
