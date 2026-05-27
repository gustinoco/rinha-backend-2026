export const QUANTIZED_ZERO = 32768;
export const QUANTIZED_SCALE = 32767;

export type VectorSearchIndex = {
  readonly dimensions: number;
  readonly count: number;
  readonly vectors: Uint16Array;
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
    // Uint16Array guarda os vetores em memoria continua e compacta.
    // Isso evita milhoes de arrays/objetos JS e reduz pressao de GC.
    vectors: new Uint16Array(dimensions * count),
    // Uint8Array basta para label binaria: 0 = legit, 1 = fraud.
    labels: new Uint8Array(count),
  };
}

export function createVectorSearchIndexFrom(
  dimensions: number,
  vectors: Uint16Array,
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

export function quantizeVector(input: Float32Array, output: Uint16Array): Uint16Array {
  for (let index = 0; index < input.length; index += 1) {
    output[index] = quantizeValue(input[index] as number);
  }

  return output;
}

export function quantizeValue(value: number): number {
  if (value < 0) {
    return 0;
  }

  if (value >= 1) {
    return 65535;
  }

  return QUANTIZED_ZERO + Math.round(value * QUANTIZED_SCALE);
}

export function topKSearch(
  index: VectorSearchIndex,
  query: Uint16Array,
  topK: number,
  result: TopKResult,
): TopKResult {
  const limit = Math.min(topK, result.indexes.length, result.distances.length);

  result.found = 0;

  for (let slot = 0; slot < limit; slot += 1) {
    result.indexes[slot] = -1;
    result.distances[slot] = Number.POSITIVE_INFINITY;
  }

  if (limit === 0 || query.length < index.dimensions) {
    return result;
  }

  for (let vectorIndex = 0; vectorIndex < index.count; vectorIndex += 1) {
    const maxDistance =
      result.found < limit ? Number.POSITIVE_INFINITY : (result.distances[limit - 1] as number);
    const vectorOffset = vectorIndex * index.dimensions;
    let distance = 0;

    for (let dimension = 0; dimension < index.dimensions; dimension += 1) {
      const diff =
        (index.vectors[vectorOffset + dimension] as number) - (query[dimension] as number);
      distance += diff * diff;

      if (distance >= maxDistance) {
        break;
      }
    }

    if (result.found < limit) {
      insertTopK(result, result.found, vectorIndex, distance);
      result.found += 1;
      continue;
    }

    if (distance < (result.distances[limit - 1] as number)) {
      insertTopK(result, limit - 1, vectorIndex, distance);
    }
  }

  return result;
}

export function topKBucketSearch(
  index: VectorSearchIndex,
  query: Uint16Array,
  topK: number,
  result: TopKResult,
): TopKResult {
  resetTopKResult(topK, result);

  if (
    result.indexes.length === 0 ||
    query.length < index.dimensions ||
    index.bucketHeads === undefined ||
    index.bucketNext === undefined
  ) {
    return topKSearch(index, query, topK, result);
  }

  const q0 = bucketNibble(query[0] as number);
  const q3 = bucketNibble(query[3] as number);
  const q4 = bucketNibble(query[4] as number);
  const q5 = bucketNibble(query[5] as number);
  const q8 = bucketNibble(query[8] as number);

  searchBucketRange(index, query, result, q0, q3, q4, q5, q8, 0);
  searchBucketRange(index, query, result, q0, q3, q4, q5, q8, 1);

  if (result.found < topK) {
    return topKSearch(index, query, topK, result);
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

function insertTopK(result: TopKResult, startSlot: number, vectorIndex: number, distance: number): void {
  let slot = startSlot;

  while (slot > 0 && distance < (result.distances[slot - 1] as number)) {
    result.distances[slot] = result.distances[slot - 1] as number;
    result.indexes[slot] = result.indexes[slot - 1] as number;
    slot -= 1;
  }

  result.distances[slot] = distance;
  result.indexes[slot] = vectorIndex;
}

function resetTopKResult(topK: number, result: TopKResult): void {
  const limit = Math.min(topK, result.indexes.length, result.distances.length);

  result.found = 0;

  for (let slot = 0; slot < limit; slot += 1) {
    result.indexes[slot] = -1;
    result.distances[slot] = Number.POSITIVE_INFINITY;
  }
}

function searchBucketRange(
  index: VectorSearchIndex,
  query: Uint16Array,
  result: TopKResult,
  q0: number,
  q3: number,
  q4: number,
  q5: number,
  q8: number,
  radius: number,
): void {
  const from0 = Math.max(0, q0 - radius);
  const to0 = Math.min(BUCKET_MASK, q0 + radius);
  const from3 = Math.max(0, q3 - radius);
  const to3 = Math.min(BUCKET_MASK, q3 + radius);
  const from4 = Math.max(0, q4 - radius);
  const to4 = Math.min(BUCKET_MASK, q4 + radius);
  const from5 = Math.max(0, q5 - radius);
  const to5 = Math.min(BUCKET_MASK, q5 + radius);
  const from8 = Math.max(0, q8 - radius);
  const to8 = Math.min(BUCKET_MASK, q8 + radius);

  for (let b0 = from0; b0 <= to0; b0 += 1) {
    for (let b3 = from3; b3 <= to3; b3 += 1) {
      for (let b4 = from4; b4 <= to4; b4 += 1) {
        for (let b5 = from5; b5 <= to5; b5 += 1) {
          for (let b8 = from8; b8 <= to8; b8 += 1) {
            if (radius > 0 && b0 === q0 && b3 === q3 && b4 === q4 && b5 === q5 && b8 === q8) {
              continue;
            }

            searchBucket(index, query, result, bucketKeyFromNibbles(b0, b3, b4, b5, b8));
          }
        }
      }
    }
  }
}

function searchBucket(
  index: VectorSearchIndex,
  query: Uint16Array,
  result: TopKResult,
  bucketKey: number,
): void {
  let vectorIndex = index.bucketHeads?.[bucketKey] ?? EMPTY_LINK;

  while (vectorIndex !== EMPTY_LINK) {
    const limit = result.indexes.length;
    const maxDistance =
      result.found < limit ? Number.POSITIVE_INFINITY : (result.distances[limit - 1] as number);
    const vectorOffset = vectorIndex * index.dimensions;
    let distance = 0;

    for (let dimension = 0; dimension < index.dimensions; dimension += 1) {
      const diff =
        (index.vectors[vectorOffset + dimension] as number) - (query[dimension] as number);
      distance += diff * diff;

      if (distance >= maxDistance) {
        break;
      }
    }

    if (result.found < limit) {
      insertTopK(result, result.found, vectorIndex, distance);
      result.found += 1;
    } else if (distance < (result.distances[limit - 1] as number)) {
      insertTopK(result, limit - 1, vectorIndex, distance);
    }

    vectorIndex = index.bucketNext?.[vectorIndex] ?? EMPTY_LINK;
  }
}

export function bucketKey(vector: Uint16Array, offset: number): number {
  return bucketKeyFromNibbles(
    bucketNibble(vector[offset] as number),
    bucketNibble(vector[offset + 3] as number),
    bucketNibble(vector[offset + 4] as number),
    bucketNibble(vector[offset + 5] as number),
    bucketNibble(vector[offset + 8] as number),
  );
}

function bucketKeyFromNibbles(b0: number, b3: number, b4: number, b5: number, b8: number): number {
  return (
    b0 |
    (b3 << BUCKET_BITS) |
    (b4 << (BUCKET_BITS * 2)) |
    (b5 << (BUCKET_BITS * 3)) |
    (b8 << (BUCKET_BITS * 4))
  );
}

function bucketNibble(value: number): number {
  if (value === 0) {
    return 0;
  }

  return 1 + Math.min(14, Math.floor(((value - QUANTIZED_ZERO) * 15) / QUANTIZED_ZERO));
}
