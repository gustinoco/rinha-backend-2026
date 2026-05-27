import { describe, expect, it } from 'vitest';
import {
  createTopKResult,
  createVectorSearchIndexFrom,
  quantizeValue,
  quantizeVector,
  topKSearch,
} from '../src/core/vector-search.js';

describe('quantizeValue', () => {
  it('maps sentinel, zero, half and one to stable Uint16 buckets', () => {
    expect(quantizeValue(-1)).toBe(0);
    expect(quantizeValue(0)).toBe(32768);
    expect(quantizeValue(0.5)).toBe(49152);
    expect(quantizeValue(1)).toBe(65535);
    expect(quantizeValue(2)).toBe(65535);
  });
});

describe('quantizeVector', () => {
  it('writes into the provided output buffer', async () => {
    const input = new Float32Array([-1, 0, 0.25, 1]);
    const output = new Uint16Array(input.length);

    const returned = await quantizeVector(input, output);

    expect(returned).toBe(output);
    expect(Array.from(output)).toEqual([0, 32768, 40960, 65535]);
  });
});

describe('topKSearch', () => {
  it('returns nearest vectors sorted by ascending squared distance', async () => {
    const vectors = new Uint16Array([
      10, 10,
      20, 20,
      13, 14,
      100, 100,
    ]);
    const labels = new Uint8Array([0, 1, 1, 0]);
    const index = createVectorSearchIndexFrom(2, vectors, labels);
    const result = createTopKResult(3);

    const neighbors = await topKSearch(index, new Uint16Array([12, 13]), 3, result);

    expect(neighbors).toBe(result);
    expect(neighbors.found).toBe(3);
    expect(Array.from(neighbors.indexes)).toEqual([2, 0, 1]);
    expect(Array.from(neighbors.distances)).toEqual([2, 13, 113]);
  });

  it('resets result buffers between calls', async () => {
    const index = createVectorSearchIndexFrom(
      1,
      new Uint16Array([1, 10, 100]),
      new Uint8Array([0, 1, 0]),
    );
    const result = createTopKResult(2);

    await topKSearch(index, new Uint16Array([100]), 2, result);
    expect(Array.from(result.indexes)).toEqual([2, 1]);

    await topKSearch(index, new Uint16Array([1]), 2, result);
    expect(Array.from(result.indexes)).toEqual([0, 1]);
    expect(Array.from(result.distances)).toEqual([0, 81]);
  });

  it('handles topK larger than result capacity and empty indexes', async () => {
    const empty = createVectorSearchIndexFrom(2, new Uint16Array([]), new Uint8Array([]));
    const result = createTopKResult(1);

    await topKSearch(empty, new Uint16Array([1, 2]), 5, result);

    expect(result.found).toBe(0);
    expect(result.indexes[0]).toBe(-1);
    expect(result.distances[0]).toBe(Number.POSITIVE_INFINITY);
  });

  it('throws when vector and label sizes are inconsistent', () => {
    expect(() =>
      createVectorSearchIndexFrom(2, new Uint16Array([1, 2, 3]), new Uint8Array([1])),
    ).toThrow('Vector data length must be divisible by dimensions');

    expect(() =>
      createVectorSearchIndexFrom(2, new Uint16Array([1, 2, 3, 4]), new Uint8Array([1])),
    ).toThrow('Labels length must match vector count');
  });
});
