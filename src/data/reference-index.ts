import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VECTOR_DIMENSIONS } from '../core/normalize.js';
import { BUCKET_COUNT, createVectorSearchIndexFrom } from '../core/vector-search.js';

const VECTORS_FILE = 'reference-vectors.u16';
const LABELS_FILE = 'reference-labels.u8';
const BUCKET_HEADS_FILE = 'reference-bucket-heads.u32';
const BUCKET_NEXT_FILE = 'reference-bucket-next.u32';

const LEGIT = 0;
const FRAUD = 1;

export const referenceIndex = loadReferenceIndex();

function loadReferenceIndex() {
  if (process.env.VITEST === 'true') {
    return createFallbackIndex();
  }

  const processedDir = join(process.cwd(), 'data', 'processed');
  const vectorsPath = join(processedDir, VECTORS_FILE);
  const labelsPath = join(processedDir, LABELS_FILE);
  const bucketHeadsPath = join(processedDir, BUCKET_HEADS_FILE);
  const bucketNextPath = join(processedDir, BUCKET_NEXT_FILE);

  if (existsSync(vectorsPath) && existsSync(labelsPath)) {
    const vectors = readUint16File(vectorsPath);
    const labels = new Uint8Array(readFileSync(labelsPath));

    if (!existsSync(bucketHeadsPath) || !existsSync(bucketNextPath)) {
      return createVectorSearchIndexFrom(VECTOR_DIMENSIONS, vectors, labels);
    }

    const bucketHeads = readUint32File(bucketHeadsPath);
    const bucketNext = readUint32File(bucketNextPath);

    if (bucketHeads.length !== BUCKET_COUNT || bucketNext.length !== labels.length) {
      return createVectorSearchIndexFrom(VECTOR_DIMENSIONS, vectors, labels);
    }

    return createVectorSearchIndexFrom(
      VECTOR_DIMENSIONS,
      vectors,
      labels,
      bucketHeads,
      bucketNext,
    );
  }

  return createFallbackIndex();
}

function createFallbackIndex() {
  const referenceVectors = new Uint16Array([
    32902, 38230, 34406, 58419, 43690, 0, 0, 33725, 37683, 32768, 65535, 32768,
    37683, 32965, 32899, 38230, 34373, 58334, 43690, 0, 0, 33751, 36045, 32768,
    65535, 32768, 37683, 32968, 32892, 35500, 34472, 58596, 43690, 0, 0, 33620,
    39321, 32768, 65535, 32768, 37683, 32965, 63921, 60074, 65535, 39891, 60074, 0,
    0, 63972, 65535, 32768, 65535, 65535, 57343, 32948, 63246, 60074, 65535, 39649,
    60074, 0, 0, 63568, 65535, 32768, 65535, 65535, 57343, 32965, 64880, 62797, 65535,
    41382, 60074, 0, 0, 64552, 63897, 32768, 65535, 65535, 57343, 32915,
  ]);

  const referenceLabels = new Uint8Array([LEGIT, LEGIT, LEGIT, FRAUD, FRAUD, FRAUD]);

  return createVectorSearchIndexFrom(VECTOR_DIMENSIONS, referenceVectors, referenceLabels);
}

function readUint32File(path: string): Uint32Array {
  const buffer = readFileSync(path);

  if (buffer.byteOffset % 4 === 0) {
    return new Uint32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  }

  const copy = new Uint32Array(buffer.byteLength / 4);

  for (let index = 0; index < copy.length; index += 1) {
    copy[index] = buffer.readUInt32LE(index * 4);
  }

  return copy;
}

function readUint16File(path: string): Uint16Array {
  const buffer = readFileSync(path);

  if (buffer.byteOffset % 2 === 0) {
    return new Uint16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
  }

  const copy = new Uint16Array(buffer.byteLength / 2);

  for (let index = 0; index < copy.length; index += 1) {
    copy[index] = buffer.readUInt16LE(index * 2);
  }

  return copy;
}
