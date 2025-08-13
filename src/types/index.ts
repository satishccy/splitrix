// The address type from the Aptos SDK
export type AptosAddress = string;

// Corresponds to the Bill struct
export interface Bill {
  bill_id: number;
  payer: AptosAddress;
  total_amount: number;
  per_share_amount: number;
  memo: string;
  debtors: AptosAddress[];
}

// Represents the data needed for the Dashboard's Group Card
export interface GroupSummary {
  id: number;
  userNetBalance: number; // Positive if owed, negative if owes
  membersCount: number;
  admin: AptosAddress;
}

// Represents a user's detailed balance with another member
export interface CounterpartyBalance {
  address: AptosAddress;
  amount: number;
}

// Represents the detailed view of a single group
export interface GroupDetails {
  id: number;
  userOwes: CounterpartyBalance[];
  userIsOwed: CounterpartyBalance[];
  bills: BillSummary[]; // A summary version of the Bill struct
}

export interface BillSummary {
  id: number;
  payer: AptosAddress;
  total_amount: number;
  memo: string;
}

// Wallet connection types
export interface WalletState {
  connected: boolean;
  address?: AptosAddress;
  connecting: boolean;
}