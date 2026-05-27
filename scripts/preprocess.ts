import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { createGunzip } from 'node:zlib';
import { VECTOR_DIMENSIONS } from '../src/core/normalize.js';
import { bucketKey, quantizeValue } from '../src/core/vector-search.js';

const INPUT_FILE = findInputFile();
const OUTPUT_DIR = join(process.cwd(), 'data', 'processed');
const VECTORS_TMP = join(OUTPUT_DIR, 'reference-vectors.u16.tmp');
const LABELS_TMP = join(OUTPUT_DIR, 'reference-labels.u8.tmp');
const VECTORS_FILE = join(OUTPUT_DIR, 'reference-vectors.u16');
const LABELS_FILE = join(OUTPUT_DIR, 'reference-labels.u8');
const BUCKET_HEADS_TMP = join(OUTPUT_DIR, 'reference-bucket-heads.u32.tmp');
const BUCKET_NEXT_TMP = join(OUTPUT_DIR, 'reference-bucket-next.u32.tmp');
const BUCKET_HEADS_FILE = join(OUTPUT_DIR, 'reference-bucket-heads.u32');
const BUCKET_NEXT_FILE = join(OUTPUT_DIR, 'reference-bucket-next.u32');
const BUCKET_COUNT = 1_048_576;
const EMPTY_LINK = 0xffffffff;
const MAX_REFERENCES = 3_000_000;

mkdirSync(OUTPUT_DIR, { recursive: true });
rmIfExists(VECTORS_TMP);
rmIfExists(LABELS_TMP);
rmIfExists(BUCKET_HEADS_TMP);
rmIfExists(BUCKET_NEXT_TMP);

const vectorOut = createWriteStream(VECTORS_TMP);
const labelOut = createWriteStream(LABELS_TMP);
const currentVector = new Uint16Array(VECTOR_DIMENSIONS);
const bucketHeads = new Uint32Array(BUCKET_COUNT);
const bucketNext = new Uint32Array(MAX_REFERENCES);

bucketHeads.fill(EMPTY_LINK);
bucketNext.fill(EMPTY_LINK);

let recent = '';
let numberBuffer = '';
let dimension = 0;
let count = 0;
let inVector = false;
let vectorReady = false;

await new Promise<void>((resolve, reject) => {
  createReadStream(INPUT_FILE)
    .pipe(createGunzip())
    .setEncoding('utf8')
    .on('data', (chunk: string) => {
      parseChunk(chunk);
    })
    .on('error', reject)
    .on('end', () => {
      vectorOut.end();
      labelOut.end();
    });

  let closed = 0;
  const onClose = () => {
    closed += 1;

    if (closed === 2) {
      resolve();
    }
  };

  vectorOut.on('error', reject);
  labelOut.on('error', reject);
  vectorOut.on('close', onClose);
  labelOut.on('close', onClose);
});

renameSync(VECTORS_TMP, VECTORS_FILE);
renameSync(LABELS_TMP, LABELS_FILE);
writeUint32File(BUCKET_HEADS_TMP, bucketHeads);
writeUint32File(BUCKET_NEXT_TMP, bucketNext.subarray(0, count));
renameSync(BUCKET_HEADS_TMP, BUCKET_HEADS_FILE);
renameSync(BUCKET_NEXT_TMP, BUCKET_NEXT_FILE);

process.stdout.write(`preprocessed references: count=${count}, dimensions=${VECTOR_DIMENSIONS}\n`);

function parseChunk(chunk: string): void {
  for (let offset = 0; offset < chunk.length; offset += 1) {
    const char = chunk[offset] as string;

    recent += char;

    if (recent.length > 32) {
      recent = recent.slice(-32);
    }

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
      writeCurrentRecord(0);
      continue;
    }

    if (vectorReady && recent.endsWith('"label":"fraud"')) {
      writeCurrentRecord(1);
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
  if (numberBuffer.length === 0) {
    return;
  }

  if (dimension >= VECTOR_DIMENSIONS) {
    throw new Error('Vector has too many dimensions');
  }

  currentVector[dimension] = quantizeValue(Number.parseFloat(numberBuffer));
  dimension += 1;
  numberBuffer = '';
}

function writeCurrentRecord(label: number): void {
  const key = bucketKey(currentVector, 0);

  bucketNext[count] = bucketHeads[key] as number;
  bucketHeads[key] = count;
  vectorOut.write(Buffer.from(currentVector.buffer, currentVector.byteOffset, currentVector.byteLength));
  labelOut.write(Uint8Array.of(label));
  vectorReady = false;
  count += 1;
}

function writeUint32File(path: string, data: Uint32Array): void {
  writeFileSync(path, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
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

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index] as string;

    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('references.json.gz not found');
}

function rmIfExists(path: string): void {
  if (existsSync(path)) {
    rmSync(path);
  }
}
