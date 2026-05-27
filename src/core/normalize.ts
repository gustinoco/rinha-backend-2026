import type { TransactionPayload } from '../types/transaction.js';
import { mccRiskMap, normalization } from '../data/config.js';

export const VECTOR_DIMENSIONS = 14;
const DEFAULT_MCC_RISK = 0.5;

export async function normalizeTransaction(
  payload: TransactionPayload,
  output: Float32Array,
): Promise<Float32Array> {
  const config = normalization;
  const requestedAt = new Date(payload.transaction.requested_at);

  output[0] = clamp01(payload.transaction.amount / config.maxAmount);
  output[1] = clamp01(payload.transaction.installments / config.maxInstallments);
  output[2] = amountVsAverage(payload.transaction.amount, payload.customer.avg_amount, config);
  output[3] = hourOfDay(requestedAt) / 23;
  output[4] = dayOfWeek(requestedAt) / 6;

  if (payload.last_transaction === null) {
    output[5] = -1;
    output[6] = -1;
  } else {
    output[5] = clamp01(
      minutesBetween(payload.last_transaction.timestamp, payload.transaction.requested_at) /
        config.maxMinutes,
    );
    output[6] = clamp01(payload.last_transaction.km_from_current / config.maxKm);
  }

  output[7] = clamp01(payload.terminal.km_from_home / config.maxKm);
  output[8] = clamp01(payload.customer.tx_count_24h / config.maxTxCount24h);
  output[9] = payload.terminal.is_online ? 1 : 0;
  output[10] = payload.terminal.card_present ? 1 : 0;
  output[11] = (await isKnownMerchant(payload.merchant.id, payload.customer.known_merchants)) ? 0 : 1;
  output[12] = mccRisk(payload.merchant.mcc);
  output[13] = clamp01(payload.merchant.avg_amount / config.maxMerchantAvgAmount);

  return output;
}

function amountVsAverage(amount: number, average: number, config: typeof normalization): number {
  if (!Number.isFinite(average) || average <= 0) {
    return 1;
  }

  return clamp01(amount / average / config.amountVsAvgRatio);
}

function hourOfDay(date: Date): number {
  const hour = date.getUTCHours();
  return Number.isFinite(hour) ? hour : 0;
}

function dayOfWeek(date: Date): number {
  const day = date.getUTCDay();

  if (!Number.isFinite(day)) {
    return 0;
  }

  return day === 0 ? 6 : day - 1;
}

function minutesBetween(previous: string, current: string): number {
  const previousMs = Date.parse(previous);
  const currentMs = Date.parse(current);

  if (!Number.isFinite(previousMs) || !Number.isFinite(currentMs)) {
    return 0;
  }

  return Math.max(0, Math.floor((currentMs - previousMs) / 60000));
}

async function isKnownMerchant(merchantId: string, knownMerchants: string[]): Promise<boolean> {
  for (let index = 0; index < knownMerchants.length; index += 1) {
    if (knownMerchants[index] === merchantId) {
      return true;
    }
  }

  return false;
}

function mccRisk(mcc: string): number {
  return mccRiskMap[mcc] ?? DEFAULT_MCC_RISK;
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
