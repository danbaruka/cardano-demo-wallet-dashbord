import { useState, useEffect } from 'react';
import { X, Flame, Loader2, CheckCircle } from 'lucide-react';
import { useWallet, useAssets } from '@meshsdk/react';
import { toast } from 'react-toastify';
import { burnToken, parseAssetUnit } from '../services/nativeTokens';
import { BurnTokenFormData, NativeToken } from '../types/nativeTokens';

interface BurnTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function BurnTokenModal({ isOpen, onClose, onSuccess }: BurnTokenModalProps) {
  const { wallet, connected } = useWallet();
  const assets = useAssets();
  
  const [selectedToken, setSelectedToken] = useState<NativeToken | null>(null);
  const [quantity, setQuantity] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [txStatus, setTxStatus] = useState<'idle' | 'burning' | 'success' | 'error'>('idle');

  // Process assets to get native tokens
  const nativeTokens: NativeToken[] = (Array.isArray(assets) ? assets : [])
    .filter((asset) => asset.unit !== 'lovelace')
    .map((asset) => {
      try {
        const { policyId, assetName } = parseAssetUnit(asset.unit);
        return {
          unit: asset.unit,
          policyId,
          assetName,
          quantity: asset.quantity || '0',
        };
      } catch (error) {
        // If parsing fails, use unit as-is
        return {
          unit: asset.unit,
          policyId: asset.unit.slice(0, 56),
          assetName: asset.unit.slice(56),
          quantity: asset.quantity || '0',
        };
      }
    });

  useEffect(() => {
    if (selectedToken) {
      setQuantity('');
    }
  }, [selectedToken]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!wallet || !connected) {
      toast.error('Wallet not connected');
      return;
    }

    if (!selectedToken) {
      toast.error('Please select a token to burn');
      return;
    }

    if (!quantity || parseFloat(quantity) <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }

    const availableQuantity = parseFloat(selectedToken.quantity);
    if (parseFloat(quantity) > availableQuantity) {
      toast.error(`Cannot burn more than available (${availableQuantity})`);
      return;
    }

    setIsProcessing(true);
    setTxStatus('burning');

    try {
      const burnData: BurnTokenFormData = {
        policyId: selectedToken.policyId,
        assetName: selectedToken.assetName,
        unit: selectedToken.unit,
        quantity,
      };

      const txHash = await burnToken(wallet, burnData);

      setTxStatus('success');
      toast.success(`Token burned! Transaction: ${txHash.slice(0, 8)}...`);

      // Reset form
      setTimeout(() => {
        setSelectedToken(null);
        setQuantity('');
        setTxStatus('idle');
        setIsProcessing(false);
        onSuccess?.();
        onClose();
      }, 2000);

    } catch (error: any) {
      console.error('Error burning token:', error);
      toast.error(error.message || 'Failed to burn token');
      setTxStatus('error');
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    if (isProcessing) return;
    onClose();
  };

  const handleMaxQuantity = () => {
    if (selectedToken) {
      setQuantity(selectedToken.quantity);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      <div className="relative w-full max-w-2xl glass-card rounded-2xl p-6 md:p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl md:text-2xl font-bold text-white">Burn Native Token</h2>
          <button
            onClick={handleClose}
            disabled={isProcessing}
            className="p-2 rounded-lg glass-card-hover text-blue-300 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Token Selector */}
          <div>
            <label className="text-blue-300 text-sm font-medium mb-2 block">
              Select Token to Burn *
            </label>
            {nativeTokens.length === 0 ? (
              <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-400/20 text-center">
                <p className="text-blue-300 text-sm">No native tokens found in wallet</p>
              </div>
            ) : (
              <select
                value={selectedToken?.unit || ''}
                onChange={(e) => {
                  const token = nativeTokens.find((t) => t.unit === e.target.value);
                  setSelectedToken(token || null);
                }}
                disabled={isProcessing}
                className="w-full bg-blue-950/60 border-2 border-blue-400/20 rounded-xl px-4 py-3 text-white focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all"
                required
              >
                <option value="">Select a token...</option>
                {nativeTokens.map((token) => (
                  <option key={token.unit} value={token.unit}>
                    {token.assetName || token.unit.slice(56, 64)} - Available: {parseFloat(token.quantity).toLocaleString()}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Selected Token Info */}
          {selectedToken && (
            <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-400/20">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-blue-300 text-sm">Policy ID:</span>
                  <span className="text-white text-sm font-mono">{selectedToken.policyId.slice(0, 16)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-300 text-sm">Asset Name:</span>
                  <span className="text-white text-sm font-mono">{selectedToken.assetName.slice(0, 16)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-300 text-sm">Available:</span>
                  <span className="text-white text-sm font-semibold">
                    {parseFloat(selectedToken.quantity).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Quantity */}
          <div>
            <label className="text-blue-300 text-sm font-medium mb-2 block">
              Quantity to Burn *
            </label>
            <div className="relative">
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                min="0"
                step="1"
                max={selectedToken ? selectedToken.quantity : undefined}
                className="w-full bg-blue-950/60 border-2 border-blue-400/20 rounded-xl px-4 py-3 pr-20 text-white placeholder-blue-400/40 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all"
                disabled={isProcessing || !selectedToken}
                required
              />
              {selectedToken && (
                <button
                  type="button"
                  onClick={handleMaxQuantity}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-blue-400 hover:text-cyan-400 transition-colors"
                  disabled={isProcessing}
                >
                  Max
                </button>
              )}
            </div>
            {selectedToken && (
              <p className="text-blue-400/60 text-xs mt-1">
                Available: {parseFloat(selectedToken.quantity).toLocaleString()}
              </p>
            )}
          </div>

          {/* Warning */}
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-400/30">
            <div className="flex items-start space-x-3">
              <Flame className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 font-semibold text-sm mb-1">Warning</p>
                <p className="text-red-300/80 text-xs">
                  Burning tokens permanently removes them from circulation. This action cannot be undone.
                </p>
              </div>
            </div>
          </div>

          {/* Status Messages */}
          {txStatus === 'burning' && (
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-400/30">
              <div className="flex items-center space-x-3">
                <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                <span className="text-blue-300">Burning token...</span>
              </div>
            </div>
          )}

          {txStatus === 'success' && (
            <div className="p-4 rounded-xl bg-green-500/10 border border-green-400/30">
              <div className="flex items-center space-x-3">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-green-400">Token burned successfully!</span>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isProcessing || !connected || !selectedToken || nativeTokens.length === 0}
            className="w-full bg-gradient-to-r from-red-600 via-orange-500 to-red-600 hover:shadow-xl hover:shadow-orange-500/30 disabled:from-red-800 disabled:to-red-700 disabled:cursor-not-allowed disabled:shadow-none text-white font-bold py-4 rounded-xl transition-all duration-300 flex items-center justify-center space-x-2"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Burning...</span>
              </>
            ) : (
              <>
                <Flame className="w-5 h-5" />
                <span>Burn Token</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
