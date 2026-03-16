import { useState } from 'react';
import { X, Upload, Image as ImageIcon, CheckCircle, Loader2, Calendar, Clock, Plus, Trash2, Key } from 'lucide-react';
import { useWallet } from '@meshsdk/react';
import { toast } from 'react-toastify';
import { mintToken } from '../services/nativeTokens';
import { uploadImageToIPFS, fileToDataURL, validateImage } from '../services/lighthouse';
import { MintTokenFormData, PolicyType } from '../types/nativeTokens';

interface MintTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function MintTokenModal({ isOpen, onClose, onSuccess }: MintTokenModalProps) {
  const { wallet, connected } = useWallet();
  
  const [formData, setFormData] = useState<MintTokenFormData>({
    tokenName: 'CardanoDemoToken',
    symbol: 'CDT',
    description: 'A demonstration native token for Cardano Devex showcase.',
    quantity: '1000000',
    decimals: '6',
    policyType: 'no-time-locked',
  });
  
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [txStatus, setTxStatus] = useState<'idle' | 'uploading' | 'building' | 'signing' | 'broadcasting' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [expirationDate, setExpirationDate] = useState('');
  const [expirationSlot, setExpirationSlot] = useState('');
  const [metadataEntries, setMetadataEntries] = useState<Array<{ key: string; value: string }>>([
    { key: 'website', value: 'https://example.com' },
    { key: 'twitter', value: '@CardanoDemo' },
    { key: 'discord', value: 'https://discord.gg/cardano' },
    { key: 'category', value: 'Utility Token' },
  ]);
  const [quantityUnit, setQuantityUnit] = useState<'units' | 'lovelace'>('units');

  if (!isOpen) return null;

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate image
    const validation = await validateImage(file);
    if (!validation.valid) {
      toast.error(validation.error || 'Invalid image');
      return;
    }

    setImageFile(file);
    
    // Create preview
    const dataURL = await fileToDataURL(file);
    setImagePreview(dataURL);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!wallet || !connected) {
      toast.error('Wallet not connected');
      return;
    }

    if (!formData.tokenName.trim()) {
      toast.error('Token name is required');
      return;
    }

    if (!formData.quantity || parseFloat(formData.quantity) <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }

    if (formData.policyType === 'time-locked' && !expirationDate && !expirationSlot) {
      toast.error('Expiration date or slot is required for time-locked policy');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setTxStatus('uploading');

    try {
      let ipfsUrl: string | undefined;

      // Step 1: Upload image if provided
      if (imageFile) {
        try {
          setProgress(10);
          setTxStatus('uploading');
          ipfsUrl = await uploadImageToIPFS(imageFile);
          setProgress(30);
          toast.success('Image uploaded to IPFS');
        } catch (error: any) {
          toast.error(`Image upload failed: ${error.message}`);
          setIsProcessing(false);
          setTxStatus('error');
          setProgress(0);
          return;
        }
      } else {
        setProgress(30);
      }

      // Step 2: Prepare metadata
      setProgress(40);
      const additionalMetadata: Record<string, string> = {};
      metadataEntries.forEach((entry) => {
        if (entry.key.trim() && entry.value.trim()) {
          // Don't include decimals in additionalMetadata as it's a separate field
          if (entry.key.trim().toLowerCase() !== 'decimals') {
            additionalMetadata[entry.key.trim()] = entry.value.trim();
          }
        }
      });

      // Add decimals to metadata if provided
      if (formData.decimals && formData.decimals.trim()) {
        additionalMetadata['decimals'] = formData.decimals.trim();
      }

      // Prepare mint data
      const mintData: MintTokenFormData = {
        ...formData,
        expirationDate: formData.policyType === 'time-locked' && expirationDate 
          ? new Date(expirationDate) 
          : undefined,
        expirationSlot: formData.policyType === 'time-locked' && expirationSlot
          ? parseInt(expirationSlot, 10)
          : undefined,
        additionalMetadata: Object.keys(additionalMetadata).length > 0 ? additionalMetadata : undefined,
      };

      // Add IPFS URL to metadata (not as File)
      if (ipfsUrl) {
        (mintData as any).imageUrl = ipfsUrl;
      }

      // Add quantity unit to mint data
      (mintData as any).quantityUnit = quantityUnit;

      // Step 3: Build transaction
      setProgress(50);
      setTxStatus('building');
      
      // Step 4: Sign transaction
      setProgress(70);
      setTxStatus('signing');
      
      // Step 5: Broadcast transaction
      setProgress(85);
      setTxStatus('broadcasting');
      
      // Mint token
      const txHash = await mintToken(wallet, mintData);
      
      setProgress(100);
      setTxStatus('success');
      toast.success(`Token minted! Transaction: ${txHash.slice(0, 8)}...`);

      // Reset form
      setTimeout(() => {
        setFormData({
          tokenName: 'CardanoDemoToken',
          symbol: 'CDT',
          description: 'A demonstration native token for Cardano Devex showcase. This token represents utility tokens for the demo platform.',
          quantity: '1000000',
          decimals: '6',
          policyType: 'no-time-locked',
        });
        setImagePreview(null);
        setImageFile(null);
        setExpirationDate('');
        setExpirationSlot('');
        setMetadataEntries([
          { key: 'website', value: 'https://example.com' },
          { key: 'twitter', value: '@CardanoDemo' },
          { key: 'discord', value: 'https://discord.gg/cardano' },
          { key: 'category', value: 'Utility Token' },
        ]);
        setQuantityUnit('units');
        setProgress(0);
        setTxStatus('idle');
        setIsProcessing(false);
        onSuccess?.();
        onClose();
      }, 2000);

    } catch (error: any) {
      console.error('Error minting token:', error);
      toast.error(error.message || 'Failed to mint token');
      setTxStatus('error');
      setProgress(0);
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    if (isProcessing) return;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      <div className="relative w-full max-w-2xl glass-card rounded-2xl p-6 md:p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl md:text-2xl font-bold text-white">Mint Native Token</h2>
          <button
            onClick={handleClose}
            disabled={isProcessing}
            className="p-2 rounded-lg glass-card-hover text-blue-300 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Token Name */}
          <div>
            <label className="text-blue-300 text-sm font-medium mb-2 block">
              Token Name *
            </label>
            <input
              type="text"
              value={formData.tokenName}
              onChange={(e) => setFormData({ ...formData, tokenName: e.target.value })}
              placeholder="MyToken"
              className="w-full bg-blue-950/60 border-2 border-blue-400/20 rounded-xl px-4 py-3 text-white placeholder-blue-400/40 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all"
              disabled={isProcessing}
              required
            />
          </div>

          {/* Symbol */}
          <div>
            <label className="text-blue-300 text-sm font-medium mb-2 block">
              Symbol (Optional)
            </label>
            <input
              type="text"
              value={formData.symbol || ''}
              onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
              placeholder="MTK"
              maxLength={10}
              className="w-full bg-blue-950/60 border-2 border-blue-400/20 rounded-xl px-4 py-3 text-white placeholder-blue-400/40 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all uppercase"
              disabled={isProcessing}
            />
            <p className="text-blue-400/60 text-xs mt-1">Token ticker symbol (e.g., BTC, ETH, ADA)</p>
          </div>

          {/* Description */}
          <div>
            <label className="text-blue-300 text-sm font-medium mb-2 block">
              Description (Optional)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Token description..."
              rows={3}
              className="w-full bg-blue-950/60 border-2 border-blue-400/20 rounded-xl px-4 py-3 text-white placeholder-blue-400/40 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all resize-none"
              disabled={isProcessing}
            />
            <p className="text-blue-400/60 text-xs mt-1">
              Max 64 bytes (will be truncated automatically if longer)
            </p>
          </div>

          {/* Quantity */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-blue-300 text-sm font-medium block">
                Quantity *
              </label>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setQuantityUnit('units')}
                  className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                    quantityUnit === 'units'
                      ? 'bg-blue-500/30 text-white border border-blue-400/50'
                      : 'bg-blue-950/60 text-blue-300 hover:text-white border border-blue-400/20'
                  }`}
                  disabled={isProcessing}
                >
                  Units
                </button>
                <button
                  type="button"
                  onClick={() => setQuantityUnit('lovelace')}
                  className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                    quantityUnit === 'lovelace'
                      ? 'bg-blue-500/30 text-white border border-blue-400/50'
                      : 'bg-blue-950/60 text-blue-300 hover:text-white border border-blue-400/20'
                  }`}
                  disabled={isProcessing}
                >
                  Lovelace
                </button>
              </div>
            </div>
            <div className="relative">
              <input
                type="number"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                placeholder={quantityUnit === 'lovelace' ? '1000000' : '1'}
                min="1"
                step={quantityUnit === 'lovelace' ? '1' : '1'}
                className="w-full bg-blue-950/60 border-2 border-blue-400/20 rounded-xl px-4 py-3 pr-24 text-white placeholder-blue-400/40 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all"
                disabled={isProcessing}
                required
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <span className="text-blue-300 text-sm font-medium">
                  {quantityUnit === 'lovelace' ? 'Lovelace' : 'Units'}
                </span>
              </div>
            </div>
            {quantityUnit === 'lovelace' && formData.quantity && !isNaN(parseFloat(formData.quantity)) && (
              <p className="text-blue-400/60 text-xs mt-1">
                ≈ {(parseFloat(formData.quantity) / 1_000_000).toFixed(6)} tADA equivalent
              </p>
            )}
            {quantityUnit === 'units' && formData.quantity && !isNaN(parseFloat(formData.quantity)) && (
              <p className="text-blue-400/60 text-xs mt-1">
                {formData.quantity} token{parseFloat(formData.quantity) !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Decimals */}
          <div>
            <label className="text-blue-300 text-sm font-medium mb-2 block">
              Decimals (Optional)
            </label>
            <input
              type="number"
              value={formData.decimals || ''}
              onChange={(e) => setFormData({ ...formData, decimals: e.target.value })}
              placeholder="6"
              min="0"
              max="18"
              step="1"
              className="w-full bg-blue-950/60 border-2 border-blue-400/20 rounded-xl px-4 py-3 text-white placeholder-blue-400/40 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all"
              disabled={isProcessing}
            />
            <p className="text-blue-400/60 text-xs mt-1">
              Number of decimal places (0-18). Determines the smallest unit of the token. 
              Example: 6 decimals means 1 token = 1,000,000 smallest units (like ADA/lovelace).
            </p>
          </div>

          {/* Policy Type */}
          <div>
            <label className="text-blue-300 text-sm font-medium mb-2 block">
              Policy Type *
            </label>
            <div className="space-y-3">
              <label className="flex items-center space-x-3 p-4 rounded-xl bg-blue-950/40 border-2 border-blue-400/20 cursor-pointer hover:border-cyan-400/40 transition-all">
                <input
                  type="radio"
                  name="policyType"
                  value="no-time-locked"
                  checked={formData.policyType === 'no-time-locked'}
                  onChange={(e) => setFormData({ ...formData, policyType: e.target.value as PolicyType })}
                  disabled={isProcessing}
                  className="w-4 h-4 text-cyan-400"
                />
                <div className="flex-1">
                  <div className="text-white font-semibold">No Time-Locked Policy</div>
                  <div className="text-blue-300 text-xs mt-1">Always open for minting and burning</div>
                </div>
              </label>

              <label className="flex items-center space-x-3 p-4 rounded-xl bg-blue-950/40 border-2 border-blue-400/20 cursor-pointer hover:border-cyan-400/40 transition-all">
                <input
                  type="radio"
                  name="policyType"
                  value="time-locked"
                  checked={formData.policyType === 'time-locked'}
                  onChange={(e) => setFormData({ ...formData, policyType: e.target.value as PolicyType })}
                  disabled={isProcessing}
                  className="w-4 h-4 text-cyan-400"
                />
                <div className="flex-1">
                  <div className="text-white font-semibold flex items-center space-x-2">
                    <Clock className="w-4 h-4" />
                    <span>Time-Locked Policy</span>
                  </div>
                  <div className="text-blue-300 text-xs mt-1">Expires after specified time (no more minting/burning after expiration)</div>
                </div>
              </label>
            </div>
          </div>

          {/* Time-Locked Expiration */}
          {formData.policyType === 'time-locked' && (
            <div className="space-y-4 p-4 rounded-xl bg-blue-950/40 border border-blue-400/20">
              <div className="flex items-center space-x-2 text-blue-300 text-sm font-medium mb-3">
                <Calendar className="w-4 h-4" />
                <span>Expiration Settings</span>
              </div>
              
              <div>
                <label className="text-blue-300 text-sm font-medium mb-2 block">
                  Expiration Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                  className="w-full bg-blue-950/60 border-2 border-blue-400/20 rounded-xl px-4 py-3 text-white focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all"
                  disabled={isProcessing}
                />
              </div>

              <div className="text-center text-blue-400/60 text-xs">OR</div>

              <div>
                <label className="text-blue-300 text-sm font-medium mb-2 block">
                  Expiration Slot Number
                </label>
                <input
                  type="number"
                  value={expirationSlot}
                  onChange={(e) => setExpirationSlot(e.target.value)}
                  placeholder="Enter slot number"
                  min="0"
                  className="w-full bg-blue-950/60 border-2 border-blue-400/20 rounded-xl px-4 py-3 text-white placeholder-blue-400/40 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all"
                  disabled={isProcessing}
                />
              </div>
            </div>
          )}

          {/* Additional Metadata */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-blue-300 text-sm font-medium block flex items-center space-x-2">
                <Key className="w-4 h-4" />
                <span>Additional Metadata (Optional)</span>
              </label>
              <button
                type="button"
                onClick={() => setMetadataEntries([...metadataEntries, { key: '', value: '' }])}
                disabled={isProcessing}
                className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed text-xs"
              >
                <Plus className="w-3 h-3" />
                <span>Add</span>
              </button>
            </div>
            
            {metadataEntries.length === 0 ? (
              <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-400/20 text-center">
                <p className="text-blue-400/60 text-xs">No additional metadata. Click "Add" to add key/value pairs.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {metadataEntries.map((entry, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={entry.key}
                      onChange={(e) => {
                        const updated = [...metadataEntries];
                        updated[index].key = e.target.value;
                        setMetadataEntries(updated);
                      }}
                      placeholder="Key"
                      className="flex-1 bg-blue-950/60 border-2 border-blue-400/20 rounded-xl px-3 py-2 text-white placeholder-blue-400/40 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all text-sm"
                      disabled={isProcessing}
                    />
                    <input
                      type="text"
                      value={entry.value}
                      onChange={(e) => {
                        const updated = [...metadataEntries];
                        updated[index].value = e.target.value;
                        setMetadataEntries(updated);
                      }}
                      placeholder="Value"
                      className="flex-1 bg-blue-950/60 border-2 border-blue-400/20 rounded-xl px-3 py-2 text-white placeholder-blue-400/40 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all text-sm"
                      disabled={isProcessing}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const updated = metadataEntries.filter((_, i) => i !== index);
                        setMetadataEntries(updated);
                      }}
                      disabled={isProcessing}
                      className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-red-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Image Upload */}
          <div>
            <label className="text-blue-300 text-sm font-medium mb-2 block">
              Token Image (Optional)
            </label>
            <div className="space-y-3">
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  disabled={isProcessing}
                  className="hidden"
                  id="image-upload"
                />
                <label
                  htmlFor="image-upload"
                  className="flex items-center justify-center space-x-2 w-full p-4 rounded-xl bg-blue-950/40 border-2 border-dashed border-blue-400/20 hover:border-cyan-400/40 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Upload className="w-5 h-5 text-blue-300" />
                  <span className="text-blue-300 text-sm">
                    {imageFile ? 'Change Image' : 'Upload Image'}
                  </span>
                </label>
              </div>

              {imagePreview && (
                <div className="relative w-32 h-32 rounded-xl overflow-hidden border-2 border-blue-400/20">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          {isProcessing && txStatus !== 'success' && txStatus !== 'error' && (
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-400/30">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                    <span className="text-blue-300 font-medium">
                      {txStatus === 'uploading' && 'Uploading image to IPFS...'}
                      {txStatus === 'building' && 'Building transaction...'}
                      {txStatus === 'signing' && 'Signing transaction...'}
                      {txStatus === 'broadcasting' && 'Broadcasting to network...'}
                    </span>
                  </div>
                  <span className="text-blue-400 text-sm font-bold">{progress}%</span>
                </div>
                <div className="relative w-full bg-blue-950/60 rounded-full h-2.5 overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-cyan-400/20"></div>
                  <div
                    className="relative bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500 h-2.5 rounded-full transition-all duration-500 shadow-lg shadow-cyan-400/50"
                    style={{
                      width: `${progress}%`,
                      backgroundSize: '200% 100%',
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-blue-400/60">
                  <span>
                    {txStatus === 'uploading' && 'Step 1/5: Uploading image'}
                    {txStatus === 'building' && 'Step 2/5: Building transaction'}
                    {txStatus === 'signing' && 'Step 3/5: Signing with wallet'}
                    {txStatus === 'broadcasting' && 'Step 4/5: Broadcasting to blockchain'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {txStatus === 'success' && (
            <div className="p-4 rounded-xl bg-green-500/10 border border-green-400/30">
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  <span className="text-green-400 font-medium">Token minted successfully!</span>
                </div>
                <div className="relative w-full bg-green-950/60 rounded-full h-2.5 overflow-hidden">
                  <div className="bg-gradient-to-r from-green-500 to-emerald-400 h-2.5 rounded-full w-full"></div>
                </div>
                <p className="text-green-400/70 text-xs">Step 5/5: Complete</p>
              </div>
            </div>
          )}

          {txStatus === 'error' && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-400/30">
              <div className="flex items-center space-x-3">
                <X className="w-5 h-5 text-red-400" />
                <span className="text-red-400">Transaction failed. Please try again.</span>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isProcessing || !connected}
            className="w-full bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600 hover:shadow-xl hover:shadow-cyan-500/30 disabled:from-blue-800 disabled:to-blue-700 disabled:cursor-not-allowed disabled:shadow-none text-white font-bold py-4 rounded-xl transition-all duration-300 flex items-center justify-center space-x-2"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>
                  {txStatus === 'uploading' ? 'Uploading...' : 
                   txStatus === 'building' ? 'Building...' : 
                   txStatus === 'signing' ? 'Signing...' : 
                   txStatus === 'broadcasting' ? 'Broadcasting...' : 
                   'Processing...'}
                </span>
              </>
            ) : (
              <>
                <ImageIcon className="w-5 h-5" />
                <span>Mint Token</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
