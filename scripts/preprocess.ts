import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createGunzip } from 'node:zlib';
import { VECTOR_DIMENSIONS } from '../src/core/normalize.js';
import { quantizeValue } from '../src/core/vector-search.js';

const INPUT_FILE = findInputFile();
const OUTPUT_DIR = join(process.cwd(), 'data', 'processed');
const VECTORS_TMP = join(OUTPUT_DIR, 'reference-vectors.u16.tmp');
const LABELS_TMP = join(OUTPUT_DIR, 'reference-labels.u8.tmp');
const VECTORS_FILE = join(OUTPUT_DIR, 'reference-vectors.u16');
const LABELS_FILE = join(OUTPUT_DIR, 'reference-labels.u8');

mkdirSync(OUTPUT_DIR, { recursive: true });
rmIfExists(VECTORS_TMP);
rmIfExists(LABELS_TMP);

const vectorOut = createWriteStream(VECTORS_TMP);
const labelOut = createWriteStream(LABELS_TMP);
const currentVector = new Uint16Array(VECTOR_DIMENSIONS);

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
  vectorOut.write(Buffer.from(currentVector.buffer, currentVector.byteOffset, currentVector.byteLength));
  labelOut.write(Uint8Array.of(label));
  vectorReady = false;
  count += 1;
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
