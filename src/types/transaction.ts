export type TransactionPayload = {
  id: string;
  transaction: {
    amount: number;
    installments: number;
    requested_at: string;
  };
  customer: {
    avg_amount: number;
    tx_count_24h: number;
    known_merchants: string[];
  };
  merchant: {
    id: string;
    mcc: string;
    avg_amount: number;
  };
  terminal: {
    is_online: boolean;
    card_present: boolean;
    km_from_home: number;
  };
  last_transaction: LastTransaction | null;
};

export type LastTransaction = {
  timestamp: string;
  km_from_current: number;
};

export type FraudScoreResponse = {
  approved: boolean;
  fraud_score: number;
};

export type FraudScoreRequest = TransactionPayload | TransactionPayload[];
