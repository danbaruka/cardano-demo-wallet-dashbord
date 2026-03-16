// Native token operations using MeshJS
import { Transaction, resolveNativeScriptHash, resolvePaymentKeyHash, serializeNativeScript } from '@meshsdk/core';
import type { BrowserWallet, IWallet, NativeScript } from '@meshsdk/core';
import { MintTokenFormData, BurnTokenFormData, SendTokenFormData, CIP68Metadata, PolicyType } from '../types/nativeTokens';
import { KOIOS_API_BASE } from '../config';

/**
 * Get current slot number from Koios API
 */
export async function getCurrentSlot(): Promise<number> {
  try {
    const response = await fetch(`${KOIOS_API_BASE}/tip`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch tip: ${response.statusText}`);
    }

    const tip = await response.json();
    return tip[0]?.abs_slot || 0;
  } catch (error) {
    console.error('Error fetching current slot:', error);
    // Fallback: estimate slot from current time
    // Preprod: ~1 slot per second
    const currentTime = Math.floor(Date.now() / 1000);
    const estimatedSlot = currentTime - 1654041600; // Approximate
    return estimatedSlot;
  }
}

/**
 * Convert date to slot number
 * Preprod: ~1 slot per second
 */
export async function dateToSlot(date: Date): Promise<number> {
  const currentSlot = await getCurrentSlot();
  const currentTime = Math.floor(Date.now() / 1000);
  const targetTime = Math.floor(date.getTime() / 1000);
  const secondsDiff = targetTime - currentTime;
  
  // Preprod: 1 slot per second
  return currentSlot + secondsDiff;
}

/**
 * Create forging script based on policy type
 * Note: For time-locked policies, we use a simple signature policy for now
 * Full time-locked support would require custom native script creation
 */
export function createForgeScript(
  changeAddress: string,
  policyType: PolicyType,
  expirationSlot?: number
): NativeScript {
  const keyHash = resolvePaymentKeyHash(changeAddress);
  const signatureScript: NativeScript = { type: 'sig', keyHash };

  if (policyType === 'time-locked' && expirationSlot) {
    return {
      type: 'all',
      scripts: [
        signatureScript,
        { type: 'before', slot: expirationSlot.toString() },
      ],
    };
  }

  return signatureScript;
}

/**
 * Truncate string to fit Cardano metadata 64-byte limit
 * Cardano metadata strings must be <= 64 bytes (not characters!)
 */
function truncateTo64Bytes(str: string): string {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const bytes = encoder.encode(str);
  
  if (bytes.length <= 64) {
    return str;
  }
  
  // Truncate to 64 bytes
  const truncated = bytes.slice(0, 64);
  // Find the last valid UTF-8 character boundary
  let lastValidIndex = 64;
  while (lastValidIndex > 0 && (truncated[lastValidIndex - 1] & 0xC0) === 0x80) {
    lastValidIndex--;
  }
  
  return decoder.decode(truncated.slice(0, lastValidIndex));
}

/**
 * Build CIP-68 metadata structure
 * All string values are truncated to 64 bytes to comply with Cardano metadata limits
 */
export function buildCIP68Metadata(
  policyId: string,
  assetName: string,
  name: string,
  symbol?: string,
  description?: string,
  image?: string,
  additionalMetadata?: Record<string, string>
): CIP68Metadata {
  // Truncate all string values to 64 bytes
  const truncatedName = truncateTo64Bytes(name);
  const truncatedSymbol = symbol ? truncateTo64Bytes(symbol) : undefined;
  const truncatedDescription = description ? truncateTo64Bytes(description) : undefined;
  const truncatedImage = image ? truncateTo64Bytes(image) : undefined;
  
  // Truncate additional metadata values
  const truncatedAdditional: Record<string, string> | undefined = additionalMetadata
    ? Object.entries(additionalMetadata).reduce((acc, [key, value]) => {
        acc[truncateTo64Bytes(key)] = truncateTo64Bytes(value);
        return acc;
      }, {} as Record<string, string>)
    : undefined;

  const metadata: CIP68Metadata = {
    [policyId]: {
      [assetName]: {
        name: truncatedName,
        ...(truncatedSymbol && { symbol: truncatedSymbol }),
        ...(truncatedDescription && { description: truncatedDescription }),
        ...(truncatedImage && { image: truncatedImage }),
        ...(truncatedAdditional && truncatedAdditional),
      },
    },
  };
  return metadata;
}

/**
 * Convert asset name to hex
 */
export function assetNameToHex(assetName: string): string {
  // Use TextEncoder for browser compatibility
  const encoder = new TextEncoder();
  const bytes = encoder.encode(assetName);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Mint native token using MeshJS Transaction API
 */
export async function mintToken(
  wallet: BrowserWallet | IWallet,
  formData: MintTokenFormData & { imageUrl?: string }
): Promise<string> {
  try {
    // Get change address
    const changeAddress = await wallet.getChangeAddress();
    
    // Calculate expiration slot if time-locked
    let expirationSlot: number | undefined;
    if (formData.policyType === 'time-locked') {
      if (formData.expirationSlot) {
        expirationSlot = formData.expirationSlot;
      } else if (formData.expirationDate) {
        expirationSlot = await dateToSlot(formData.expirationDate);
      }
    }

    // Create forging script (native script)
    const forgingScript = createForgeScript(
      changeAddress,
      formData.policyType,
      expirationSlot
    );

    // Get policy ID from forging script
    const policyId = resolveNativeScriptHash(forgingScript);

    // Convert asset name to hex
    const assetNameHex = assetNameToHex(formData.tokenName);

    // Parse quantity - handle lovelace vs units
    // IMPORTANT: MeshJS mint() expects quantity in the smallest unit (like lovelace for tokens)
    // - If quantityUnit is 'lovelace': use quantity as-is (already in smallest unit)
    // - If quantityUnit is 'units': convert to smallest unit using decimals
    let quantity: string;
    
    if (formData.quantityUnit === 'lovelace') {
      // Quantity is already in smallest unit (lovelace), use directly - NO CONVERSION
      quantity = formData.quantity.trim();
      
      // Validate it's a valid number
      if (isNaN(parseFloat(quantity)) || parseFloat(quantity) <= 0) {
        throw new Error('Invalid quantity: must be a positive number');
      }
    } else {
      // Quantity is in whole units, need to convert to smallest unit
      const quantityNum = parseFloat(formData.quantity);
      if (isNaN(quantityNum) || quantityNum <= 0) {
        throw new Error('Invalid quantity: must be a positive number');
      }
      
      // Get decimals (default to 0 if not specified)
      const decimals = formData.decimals ? parseInt(formData.decimals.trim(), 10) : 0;
      if (isNaN(decimals) || decimals < 0 || decimals > 18) {
        throw new Error('Invalid decimals: must be between 0 and 18');
      }
      
      // Convert whole units to smallest unit: multiply by 10^decimals
      // Example: 1 unit with 6 decimals = 1 * 10^6 = 1,000,000 smallest units
      const smallestUnitQuantity = quantityNum * Math.pow(10, decimals);
      
      // Use Math.floor to avoid floating point issues, then convert to string
      quantity = Math.floor(smallestUnitQuantity).toString();
    }

    // Build metadata
    const imageUrl = formData.imageUrl || (typeof formData.image === 'string' ? formData.image : undefined);
    const metadata = buildCIP68Metadata(
      policyId,
      assetNameHex,
      formData.tokenName,
      formData.symbol,
      formData.description,
      imageUrl,
      formData.additionalMetadata
    );

    // Create transaction
    const tx = new Transaction({ initiator: wallet });

    // Access the underlying MeshTxBuilder to use mint methods
    // Mint the asset using mint(quantity, policyId, assetNameHex)
    tx.txBuilder.mint(quantity, policyId, assetNameHex);

    // Set the minting script
    const serialized = serializeNativeScript(forgingScript);
    const scriptCBOR = serialized.scriptCbor;
    if (!scriptCBOR) {
      throw new Error('Failed to serialize native script for minting');
    }
    tx.txBuilder.mintingScript(scriptCBOR);

    // Add metadata (CIP-68 format uses label 721)
    tx.setMetadata(721, metadata);

    // Set change address
    tx.setChangeAddress(changeAddress);

    // Build and sign transaction
    const unsignedTx = await tx.build();
    const signedTx = await wallet.signTx(unsignedTx);

    // Submit transaction
    const txHash = await wallet.submitTx(signedTx);

    return txHash;
  } catch (error: any) {
    console.error('Error minting token:', error);
    throw new Error(`Failed to mint token: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Burn native token
 */
export async function burnToken(
  _wallet: BrowserWallet | IWallet,
  formData: BurnTokenFormData
): Promise<string> {
  try {

    // Convert asset name to hex if needed
    const assetNameHex = formData.assetName.startsWith('0x') 
      ? formData.assetName.slice(2) 
      : assetNameToHex(formData.assetName);

    // TODO: Implement actual burning with MeshJS Transaction API
    // This requires proper provider setup and correct API usage
    throw new Error(
      'Burning functionality requires MeshJS Transaction API setup. ' +
      'Please refer to MeshJS documentation for burning native tokens. ' +
      `Policy ID: ${formData.policyId}, Asset Name: ${assetNameHex}, Quantity: ${formData.quantity}`
    );
  } catch (error: any) {
    console.error('Error burning token:', error);
    throw new Error(`Failed to burn token: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Send native token
 */
export async function sendToken(
  _wallet: BrowserWallet | IWallet,
  formData: SendTokenFormData
): Promise<string> {
  try {
    // Validate recipient address
    if (!formData.recipientAddress.startsWith('addr')) {
      throw new Error('Invalid recipient address format');
    }

    // TODO: Implement actual token sending with MeshJS Transaction API
    // This requires proper provider setup and correct API usage
    // For sending tokens, you'd typically use Transaction.sendValue or similar
    throw new Error(
      'Token sending functionality requires MeshJS Transaction API setup. ' +
      'Please refer to MeshJS documentation for sending native tokens. ' +
      `Recipient: ${formData.recipientAddress}, Unit: ${formData.unit}, Quantity: ${formData.quantity}`
    );
  } catch (error: any) {
    console.error('Error sending token:', error);
    throw new Error(`Failed to send token: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Parse asset unit to policy ID and asset name
 */
export function parseAssetUnit(unit: string): { policyId: string; assetName: string } {
  // Unit format: policyId (56 chars) + assetName (hex)
  if (unit.length < 56) {
    throw new Error('Invalid asset unit format');
  }
  
  const policyId = unit.slice(0, 56);
  const assetNameHex = unit.slice(56);
  
  return {
    policyId,
    assetName: assetNameHex,
  };
}
