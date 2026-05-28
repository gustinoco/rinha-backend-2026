import type { TransactionPayload } from '../types/transaction.js';
import { mccRiskMap, normalization } from '../data/config.js';

export const VECTOR_DIMENSIONS = 14;
const DEFAULT_MCC_RISK = 0.5;
const ZERO_CHAR = 48;

export function normalizeTransaction(
  payload: TransactionPayload,
  output: Float32Array,
): Float32Array {
  const config = normalization;
  const ts = payload.transaction.requested_at;

  // Parse YYYY-MM-DDTHH:MM:SSZ direto via charCodeAt (evita o overhead do `new Date()`)
  const tYear =
    (ts.charCodeAt(0) - ZERO_CHAR) * 1000 +
    (ts.charCodeAt(1) - ZERO_CHAR) * 100 +
    (ts.charCodeAt(2) - ZERO_CHAR) * 10 +
    (ts.charCodeAt(3) - ZERO_CHAR);
  const tMonth = (ts.charCodeAt(5) - ZERO_CHAR) * 10 + (ts.charCodeAt(6) - ZERO_CHAR);
  const tDay = (ts.charCodeAt(8) - ZERO_CHAR) * 10 + (ts.charCodeAt(9) - ZERO_CHAR);
  const tHour = (ts.charCodeAt(11) - ZERO_CHAR) * 10 + (ts.charCodeAt(12) - ZERO_CHAR);
  const tMinute = (ts.charCodeAt(14) - ZERO_CHAR) * 10 + (ts.charCodeAt(15) - ZERO_CHAR);

  const amount = payload.transaction.amount;
  const customer = payload.customer;
  const merchant = payload.merchant;
  const terminal = payload.terminal;

  output[0] = clamp01(amount / config.maxAmount);
  output[1] = clamp01(payload.transaction.installments / config.maxInstallments);
  output[2] = amountVsAverage(amount, customer.avg_amount, config);

  // Validacao em uma unica expressao: NaN/garbage falham sem branch a mais.
  const validTs = tHour <= 23 && tMonth >= 1 && tMonth <= 12 && tDay >= 1 && tDay <= 31;
  if (validTs) {
    output[3] = tHour / 23;
    output[4] = dayOfWeek(tYear, tMonth, tDay) / 6;
  } else {
    output[3] = 0;
    output[4] = 0;
  }

  const lastTx = payload.last_transaction;
  if (lastTx === null) {
    output[5] = -1;
    output[6] = -1;
  } else {
    const pts = lastTx.timestamp;
    const pYear =
      (pts.charCodeAt(0) - ZERO_CHAR) * 1000 +
      (pts.charCodeAt(1) - ZERO_CHAR) * 100 +
      (pts.charCodeAt(2) - ZERO_CHAR) * 10 +
      (pts.charCodeAt(3) - ZERO_CHAR);
    const pMonth = (pts.charCodeAt(5) - ZERO_CHAR) * 10 + (pts.charCodeAt(6) - ZERO_CHAR);
    const pDay = (pts.charCodeAt(8) - ZERO_CHAR) * 10 + (pts.charCodeAt(9) - ZERO_CHAR);
    const pHour = (pts.charCodeAt(11) - ZERO_CHAR) * 10 + (pts.charCodeAt(12) - ZERO_CHAR);
    const pMinute = (pts.charCodeAt(14) - ZERO_CHAR) * 10 + (pts.charCodeAt(15) - ZERO_CHAR);

    // Epoch aproximado em minutos: meses de 31 dias.
    // O erro so aparece em diffs que atravessam meses, e como clampamos por
    // maxMinutes (=1440) qualquer diff acima de 24h ja vira 1 mesmo.
    const currentMinutes =
      ((tYear * 12 + tMonth - 1) * 31 + tDay - 1) * 1440 + tHour * 60 + tMinute;
    const previousMinutes =
      ((pYear * 12 + pMonth - 1) * 31 + pDay - 1) * 1440 + pHour * 60 + pMinute;
    const diff = currentMinutes - previousMinutes;

    output[5] = clamp01((diff > 0 ? diff : 0) / config.maxMinutes);
    output[6] = clamp01(lastTx.km_from_current / config.maxKm);
  }

  output[7] = clamp01(terminal.km_from_home / config.maxKm);
  output[8] = clamp01(customer.tx_count_24h / config.maxTxCount24h);
  output[9] = terminal.is_online ? 1 : 0;
  output[10] = terminal.card_present ? 1 : 0;
  output[11] = isKnownMerchant(merchant.id, customer.known_merchants) ? 0 : 1;
  output[12] = mccRiskMap[merchant.mcc] ?? DEFAULT_MCC_RISK;
  output[13] = clamp01(merchant.avg_amount / config.maxMerchantAvgAmount);

  return output;
}

function amountVsAverage(amount: number, average: number, config: typeof normalization): number {
  if (!Number.isFinite(average) || average <= 0) {
    return 1;
  }

  return clamp01(amount / average / config.amountVsAvgRatio);
}

// Zeller's congruence: dia da semana a partir de y/m/d.
// Mapeia para 0=Mon..6=Sun (compativel com o codigo anterior).
function dayOfWeek(year: number, month: number, day: number): number {
  let y = year;
  let m = month;
  if (m < 3) {
    m += 12;
    y -= 1;
  }
  const k = y % 100;
  const j = (y / 100) | 0;
  // h: 0=Sat, 1=Sun, ..., 6=Fri
  const h = (((day + (((13 * (m + 1)) / 5) | 0) + k + ((k / 4) | 0) + ((j / 4) | 0) - 2 * j) % 7) + 7) % 7;
  return (h + 5) % 7;
}

function isKnownMerchant(merchantId: string, knownMerchants: string[]): boolean {
  const length = knownMerchants.length;
  for (let index = 0; index < length; index += 1) {
    if (knownMerchants[index] === merchantId) {
      return true;
    }
  }
  return false;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}
