export const QUANTIZED_ZERO = 32768;
export const QUANTIZED_SCALE = 32767;

export type VectorSearchIndex = {
  readonly dimensions: number;
  readonly count: number;
  readonly vectors: Uint16Array;
  readonly labels: Uint8Array;
};

export type TopKResult = {
  readonly indexes: Int32Array;
  readonly distances: Float64Array;
  found: number;
};

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
): VectorSearchIndex {
  if (vectors.length % dimensions !== 0) {
    throw new Error('Vector data length must be divisible by dimensions');
  }

  const count = vectors.length / dimensions;

  if (labels.length !== count) {
    throw new Error('Labels length must match vector count');
  }

  return {
    dimensions,
    count,
    vectors,
    labels,
  };
}

export async function quantizeVector(
  input: Float32Array,
  output: Uint16Array,
): Promise<Uint16Array> {
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

export async function topKSearch(
  index: VectorSearchIndex,
  query: Uint16Array,
  topK: number,
  result: TopKResult,
): Promise<TopKResult> {
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
