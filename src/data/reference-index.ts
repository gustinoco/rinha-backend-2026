import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VECTOR_DIMENSIONS } from '../core/normalize.js';
import { BUCKET_COUNT, createVectorSearchIndexFrom } from '../core/vector-search.js';

const VECTORS_FILE = 'reference-vectors.u8';
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
    const vectors = readUint8File(vectorsPath);
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
  const referenceVectors = new Uint8Array([
    129, 149, 134, 227, 170, 0, 0, 132, 147, 128, 255, 128, 147, 129,
    129, 149, 134, 227, 170, 0, 0, 132, 141, 128, 255, 128, 147, 129,
    128, 139, 135, 228, 170, 0, 0, 131, 153, 128, 255, 128, 147, 129,
    249, 234, 255, 156, 234, 0, 0, 249, 255, 128, 255, 255, 223, 129,
    246, 234, 255, 155, 234, 0, 0, 247, 255, 128, 255, 255, 223, 129,
    252, 244, 255, 161, 234, 0, 0, 251, 249, 128, 255, 255, 223, 129,
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

function readUint8File(path: string): Uint8Array {
  const buffer = readFileSync(path);
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}
