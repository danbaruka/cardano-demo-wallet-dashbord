// Lighthouse Storage API service for IPFS image uploads
import lighthouse from '@lighthouse-web3/sdk';
import { LIGHTHOUSE_STORAGE_APIKEY } from '../config';
import { ImageValidationResult } from '../types/nativeTokens';

/**
 * Validate image file before upload
 * Checks file type and verifies it's actually an image by reading the file
 */
export async function validateImage(file: File): Promise<ImageValidationResult> {
  // Check file type
  if (!file.type.startsWith('image/')) {
    return {
      valid: false,
      error: 'File must be an image',
    };
  }

  // Verify it's actually an image by trying to load it
  try {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ valid: true });
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({
          valid: false,
          error: 'File is not a valid image',
        });
      };
      
      img.src = url;
    });
  } catch (error) {
    return {
      valid: false,
      error: 'Failed to validate image',
    };
  }
}

/**
 * Upload image to Lighthouse Storage (IPFS)
 * Returns IPFS URL
 */
export async function uploadImageToIPFS(file: File): Promise<string> {
  if (!LIGHTHOUSE_STORAGE_APIKEY) {
    throw new Error('Lighthouse Storage API key is not configured');
  }

  // Validate image first
  const validation = await validateImage(file);
  if (!validation.valid) {
    throw new Error(validation.error || 'Image validation failed');
  }

  try {
    // Convert File to ArrayBuffer for uploadBuffer method
    const arrayBuffer = await file.arrayBuffer();
    
    // Use Lighthouse SDK uploadBuffer method for browser File objects
    // The SDK handles the upload to IPFS and returns the response
    const uploadResponse = await lighthouse.uploadBuffer(arrayBuffer, LIGHTHOUSE_STORAGE_APIKEY);
    
    // Lighthouse SDK returns an object with data property containing the hash
    // The structure is: { data: { Hash: string, Name: string, Size: string } }
    // Test confirmed: { data: { Hash: "bafkreido4pfqfoawi3cgeknncarutbdfw5zxsqqio3vebiale7nu5x4o4a", ... } }
    const ipfsHash = uploadResponse.data?.Hash || 
                     (uploadResponse as any)?.Hash || 
                     (uploadResponse as any)?.hash;
    
    if (!ipfsHash) {
      // If no hash in expected locations, check the full response
      console.error('Lighthouse upload response:', uploadResponse);
      throw new Error('No IPFS hash returned from Lighthouse');
    }

    // Return IPFS gateway URL
    return `https://gateway.lighthouse.storage/ipfs/${ipfsHash}`;
  } catch (error: any) {
    console.error('Error uploading to Lighthouse:', error);
    throw new Error(`Failed to upload image: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Convert File to base64 data URL (for preview)
 */
export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
