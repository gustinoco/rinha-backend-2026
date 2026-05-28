import {
  createReadStream,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { createGunzip } from 'node:zlib';
import hnsw from 'hnswlib-node';
import { VECTOR_DIMENSIONS } from '../src/core/normalize.js';

const { HierarchicalNSW } = hnsw;

// HNSW params — N=350K + M=16 dá ~67MB de HNSW.
// efConstruction=200 garante grafo de boa qualidade, ef_search ajustavel em runtime.
const TARGET_SAMPLES = 350_000;
const HNSW_M = 16;
const HNSW_EF_CONSTRUCTION = 200;
const HNSW_SEED = 100;

const INPUT_FILE = findInputFile();
const OUTPUT_DIR = join(process.cwd(), 'data', 'processed');
const HNSW_TMP = join(OUTPUT_DIR, 'reference-hnsw.dat.tmp');
const HNSW_FILE = join(OUTPUT_DIR, 'reference-hnsw.dat');
const LABELS_TMP = join(OUTPUT_DIR, 'reference-labels.u8.tmp');
const LABELS_FILE = join(OUTPUT_DIR, 'reference-labels.u8');

mkdirSync(OUTPUT_DIR, { recursive: true });
rmIfExists(HNSW_TMP);
rmIfExists(LABELS_TMP);

type SampleBuffer = {
  vectors: Float32Array;
  count: number;
  cap: number;
};

// Dois buffers separados pra estratificar por label (fraud vs legit).
// Mantem a proporcao do dataset (~44% fraud / 56% legit).
const FRAUD_TARGET = Math.round(TARGET_SAMPLES * 0.44);
const LEGIT_TARGET = TARGET_SAMPLES - FRAUD_TARGET;

const fraudBuf = createBuffer(FRAUD_TARGET);
const legitBuf = createBuffer(LEGIT_TARGET);

const currentVector = new Float32Array(VECTOR_DIMENSIONS);

let recent = '';
let numberBuffer = '';
let dimension = 0;
let totalSeen = 0;
let inVector = false;
let vectorReady = false;

await new Promise<void>((resolve, reject) => {
  createReadStream(INPUT_FILE)
    .pipe(createGunzip())
    .setEncoding('utf8')
    .on('data', (chunk: string) => parseChunk(chunk))
    .on('error', reject)
    .on('end', () => resolve());
});

process.stdout.write(
  `parsed: ${totalSeen} total, sampled ${fraudBuf.count} fraud + ${legitBuf.count} legit\n`,
);

const totalSamples = fraudBuf.count + legitBuf.count;
const labels = new Uint8Array(totalSamples);
const index = new HierarchicalNSW('l2', VECTOR_DIMENSIONS);
index.initIndex(totalSamples, HNSW_M, HNSW_EF_CONSTRUCTION, HNSW_SEED);

const scratch = new Array<number>(VECTOR_DIMENSIONS);
let nextId = 0;
const t0 = Date.now();

addBufferToIndex(fraudBuf, 1);
addBufferToIndex(legitBuf, 0);

process.stdout.write(`hnsw built in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

index.writeIndexSync(HNSW_TMP);
writeFileSync(LABELS_TMP, labels);
renameSync(HNSW_TMP, HNSW_FILE);
renameSync(LABELS_TMP, LABELS_FILE);

process.stdout.write(
  `preprocessed: ${totalSamples} refs (M=${HNSW_M}, efC=${HNSW_EF_CONSTRUCTION})\n`,
);

function addBufferToIndex(buf: SampleBuffer, label: number): void {
  for (let i = 0; i < buf.count; i += 1) {
    const off = i * VECTOR_DIMENSIONS;
    for (let d = 0; d < VECTOR_DIMENSIONS; d += 1) {
      scratch[d] = buf.vectors[off + d] as number;
    }
    index.addPoint(scratch, nextId);
    labels[nextId] = label;
    nextId += 1;
  }
}

function createBuffer(cap: number): SampleBuffer {
  return {
    vectors: new Float32Array(cap * VECTOR_DIMENSIONS),
    count: 0,
    cap,
  };
}

function parseChunk(chunk: string): void {
  for (let offset = 0; offset < chunk.length; offset += 1) {
    const char = chunk[offset] as string;

    recent += char;
    if (recent.length > 32) recent = recent.slice(-32);

    if (!inVector && recent.endsWith('"vector":[')) {
      inVector = true;
      vectorReady = false;
      dimension = 0;
      numberBuffer = '';
      continue;
    }

    if (inVector) {
      parseVectorChar(char);
      continue;
    }

    if (vectorReady && recent.endsWith('"label":"legit"')) {
      acceptRecord(0);
      continue;
    }
    if (vectorReady && recent.endsWith('"label":"fraud"')) {
      acceptRecord(1);
    }
  }
}

function parseVectorChar(char: string): void {
  if (isNumberChar(char)) {
    numberBuffer += char;
    return;
  }
  flushNumber();
  if (char === ']') {
    if (dimension !== VECTOR_DIMENSIONS) {
      throw new Error(`Invalid vector dimensions: ${dimension}`);
    }
    inVector = false;
    vectorReady = true;
  }
}

function flushNumber(): void {
  if (numberBuffer.length === 0) return;
  if (dimension >= VECTOR_DIMENSIONS) throw new Error('Vector too many dims');
  currentVector[dimension] = Number.parseFloat(numberBuffer);
  dimension += 1;
  numberBuffer = '';
}

function acceptRecord(label: number): void {
  totalSeen += 1;
  vectorReady = false;

  const buf = label === 1 ? fraudBuf : legitBuf;
  if (buf.count >= buf.cap) return;

  const off = buf.count * VECTOR_DIMENSIONS;
  for (let d = 0; d < VECTOR_DIMENSIONS; d += 1) {
    buf.vectors[off + d] = currentVector[d] as number;
  }
  buf.count += 1;
}

function isNumberChar(char: string): boolean {
  return (
    (char >= '0' && char <= '9') ||
    char === '-' ||
    char === '+' ||
    char === '.' ||
    char === 'e' ||
    char === 'E'
  );
}

function findInputFile(): string {
  const candidates = [
    join(process.cwd(), 'references.json.gz'),
    join(process.cwd(), 'resources', 'references.json.gz'),
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const c = candidates[i] as string;
    if (existsSync(c)) return c;
  }
  throw new Error('references.json.gz not found');
}

function rmIfExists(path: string): void {
  if (existsSync(path)) rmSync(path);
}
