import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type NormalizationConfig = {
  readonly maxAmount: number;
  readonly maxInstallments: number;
  readonly amountVsAvgRatio: number;
  readonly maxMinutes: number;
  readonly maxKm: number;
  readonly maxTxCount24h: number;
  readonly maxMerchantAvgAmount: number;
};

type RawNormalizationConfig = {
  readonly max_amount: number;
  readonly max_installments: number;
  readonly amount_vs_avg_ratio: number;
  readonly max_minutes: number;
  readonly max_km: number;
  readonly max_tx_count_24h: number;
  readonly max_merchant_avg_amount: number;
};

const DEFAULT_NORMALIZATION: NormalizationConfig = {
  maxAmount: 10000,
  maxInstallments: 12,
  amountVsAvgRatio: 10,
  maxMinutes: 1440,
  maxKm: 1000,
  maxTxCount24h: 20,
  maxMerchantAvgAmount: 10000,
};

const DEFAULT_MCC_RISK: Record<string, number> = {
  '5411': 0.15,
  '5812': 0.3,
  '5912': 0.2,
  '5944': 0.45,
  '7801': 0.8,
  '7802': 0.75,
  '7995': 0.85,
  '4511': 0.35,
  '5311': 0.25,
  '5999': 0.5,
};

export const normalization = loadNormalization();
export const mccRiskMap = loadMccRisk();

function loadNormalization(): NormalizationConfig {
  const file = findDataFile('normalization.json');

  if (file === null) {
    return DEFAULT_NORMALIZATION;
  }

  const raw = JSON.parse(readFileSync(file, 'utf8')) as RawNormalizationConfig;

  return {
    maxAmount: raw.max_amount,
    maxInstallments: raw.max_installments,
    amountVsAvgRatio: raw.amount_vs_avg_ratio,
    maxMinutes: raw.max_minutes,
    maxKm: raw.max_km,
    maxTxCount24h: raw.max_tx_count_24h,
    maxMerchantAvgAmount: raw.max_merchant_avg_amount,
  };
}

function loadMccRisk(): Record<string, number> {
  const file = findDataFile('mcc_risk.json');

  if (file === null) {
    return DEFAULT_MCC_RISK;
  }

  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, number>;
}

function findDataFile(fileName: string): string | null {
  const candidates = [join(process.cwd(), fileName), join(process.cwd(), 'resources', fileName)];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index] as string;

    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}
