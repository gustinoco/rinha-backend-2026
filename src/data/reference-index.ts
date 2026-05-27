import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VECTOR_DIMENSIONS } from '../core/normalize.js';
import { createVectorSearchIndexFrom } from '../core/vector-search.js';

const VECTORS_FILE = 'reference-vectors.u16';
const LABELS_FILE = 'reference-labels.u8';

const LEGIT = 0;
const FRAUD = 1;

export const referenceIndex = loadReferenceIndex();

function loadReferenceIndex() {
  const processedDir = join(process.cwd(), 'data', 'processed');
  const vectorsPath = join(processedDir, VECTORS_FILE);
  const labelsPath = join(processedDir, LABELS_FILE);

  if (existsSync(vectorsPath) && existsSync(labelsPath)) {
    return createVectorSearchIndexFrom(
      VECTOR_DIMENSIONS,
      readUint16File(vectorsPath),
      new Uint8Array(readFileSync(labelsPath)),
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
