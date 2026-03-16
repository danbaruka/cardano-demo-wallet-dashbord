export const CARDANO_NETWORK = (import.meta.env.VITE_CARDANO_NETWORK || 'preprod').toLowerCase();

// Address prefix used for network validation (e.g., 'addr_test1' for preprod, 'addr1' for mainnet)
export const ADDRESS_PREFIX = import.meta.env.VITE_ADDRESS_PREFIX || (CARDANO_NETWORK === 'mainnet' ? 'addr1' : 'addr_test1');

// Koios API base
// In development, use Vite proxy to avoid CORS issues (/api/koios)
// In production, use direct API URL or allow override via env var
const isDevelopment = import.meta.env.DEV;
export const KOIOS_API_BASE = import.meta.env.VITE_KOIOS_API_BASE || (
    isDevelopment
        ? '/api/koios'  // Use Vite proxy in development
        : 'https://preprod.koios.rest/api/v1'  // Direct API in production
);

// Cardanoscan (or explorer) base (e.g., 'https://preprod.cardanoscan.io')
export const CARDANOSCANNER_BASE = import.meta.env.VITE_CARDANOSCANNER_BASE || 'https://preprod.cardanoscan.io';

// Lighthouse Storage API key for IPFS uploads
export const LIGHTHOUSE_STORAGE_APIKEY = import.meta.env.VITE_LIGHTHOUSE_STORAGE_APIKEY || '';
