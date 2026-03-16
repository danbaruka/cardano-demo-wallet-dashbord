// Type definitions for native token operations

export type PolicyType = 'no-time-locked' | 'time-locked';

export interface TimeLockedPolicy {
  type: 'time-locked';
  expirationSlot?: number;
  expirationDate?: Date;
}

export interface NoTimeLockedPolicy {
  type: 'no-time-locked';
}

export type MintingPolicy = TimeLockedPolicy | NoTimeLockedPolicy;

export interface TokenMetadata {
  name: string;
  symbol?: string;
  description?: string;
  image?: string; // IPFS URL
  [key: string]: any;
}

export interface CIP68Metadata {
  [policyId: string]: {
    [assetName: string]: TokenMetadata;
  };
}

export interface MintTokenFormData {
  tokenName: string;
  symbol?: string;
  description?: string;
  quantity: string;
  quantityUnit?: 'units' | 'lovelace';
  decimals?: string; // Number of decimal places (0-18)
  image?: File;
  policyType: PolicyType;
  expirationSlot?: number;
  expirationDate?: Date;
  additionalMetadata?: Record<string, string>; // Key/value pairs for additional metadata
}

export interface BurnTokenFormData {
  policyId: string;
  assetName: string;
  unit: string; // policyId + assetName hex
  quantity: string;
}

export interface SendTokenFormData {
  policyId: string;
  assetName: string;
  unit: string;
  quantity: string;
  recipientAddress: string;
}

export interface NativeToken {
  unit: string;
  policyId: string;
  assetName: string;
  quantity: string;
  metadata?: TokenMetadata;
  policyType?: PolicyType;
  expirationSlot?: number;
}

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
}
