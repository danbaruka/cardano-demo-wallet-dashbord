import { useState, useEffect } from 'react';
import { X, Send, Loader2, CheckCircle } from 'lucide-react';
import { useWallet, useAssets } from '@meshsdk/react';
import { toast } from 'react-toastify';
import { sendToken, parseAssetUnit } from '../services/nativeTokens';
import { SendTokenFormData, NativeToken } from '../types/nativeTokens';
import { ADDRESS_PREFIX } from '../config';

interface SendTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function SendTokenModal({ isOpen, onClose, onSuccess }: SendTokenModalProps) {
  const { wallet, connected } = useWallet();
  const assets = useAssets();
  
  const [selectedToken, setSelectedToken] = useState<NativeToken | null>(null);
  const [recipientAddress, setRecipientAddress] = useState('');
  const [quantity, setQuantity] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [txStatus, setTxStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

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

  const validateAddress = (address: string): boolean => {
    return address.startsWith(ADDRESS_PREFIX) && address.length >= 50;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!wallet || !connected) {
      toast.error('Wallet not connected');
      return;
    }

    if (!selectedToken) {
      toast.error('Please select a token to send');
      return;
    }

    if (!recipientAddress || !validateAddress(recipientAddress)) {
      toast.error(`Invalid recipient address. Must start with ${ADDRESS_PREFIX}`);
      return;
    }

    if (!quantity || parseFloat(quantity) <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }

    const availableQuantity = parseFloat(selectedToken.quantity);
    if (parseFloat(quantity) > availableQuantity) {
      toast.error(`Cannot send more than available (${availableQuantity})`);
      return;
    }

    setIsProcessing(true);
    setTxStatus('sending');

    try {
      const sendData: SendTokenFormData = {
        policyId: selectedToken.policyId,
        assetName: selectedToken.assetName,
        unit: selectedToken.unit,
        quantity,
        recipientAddress,
      };

      const txHash = await sendToken(wallet, sendData);

      setTxStatus('success');
      toast.success(`Token sent! Transaction: ${txHash.slice(0, 8)}...`);

      // Reset form
      setTimeout(() => {
        setSelectedToken(null);
        setRecipientAddress('');
        setQuantity('');
        setTxStatus('idle');
        setIsProcessing(false);
        onSuccess?.();
        onClose();
      }, 2000);

    } catch (error: any) {
      console.error('Error sending token:', error);
      toast.error(error.message || 'Failed to send token');
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
          <h2 className="text-xl md:text-2xl font-bold text-white">Send Native Token</h2>
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
              Select Token to Send *
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
                  <span className="text-blue-300 text-sm">Available:</span>
                  <span className="text-white text-sm font-semibold">
                    {parseFloat(selectedToken.quantity).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Recipient Address */}
          <div>
            <label className="text-blue-300 text-sm font-medium mb-2 block">
              Recipient Address *
            </label>
            <input
              type="text"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              placeholder={`${ADDRESS_PREFIX}...`}
              className="w-full bg-blue-950/60 border-2 border-blue-400/20 rounded-xl px-4 py-3 text-white placeholder-blue-400/40 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all font-mono text-sm"
              disabled={isProcessing}
              required
            />
          </div>

          {/* Quantity */}
          <div>
            <label className="text-blue-300 text-sm font-medium mb-2 block">
              Quantity *
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

          {/* Info */}
          <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-400/30">
            <div className="flex items-start space-x-3">
              <div className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5">ℹ️</div>
              <div>
                <p className="text-blue-300 text-xs">
                  Minimum ~2 ADA will be sent along with the token to cover UTXO requirements.
                </p>
              </div>
            </div>
          </div>

          {/* Status Messages */}
          {txStatus === 'sending' && (
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-400/30">
              <div className="flex items-center space-x-3">
                <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                <span className="text-blue-300">Sending token...</span>
              </div>
            </div>
          )}

          {txStatus === 'success' && (
            <div className="p-4 rounded-xl bg-green-500/10 border border-green-400/30">
              <div className="flex items-center space-x-3">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-green-400">Token sent successfully!</span>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isProcessing || !connected || !selectedToken || nativeTokens.length === 0}
            className="w-full bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600 hover:shadow-xl hover:shadow-cyan-500/30 disabled:from-blue-800 disabled:to-blue-700 disabled:cursor-not-allowed disabled:shadow-none text-white font-bold py-4 rounded-xl transition-all duration-300 flex items-center justify-center space-x-2"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                <span>Send Token</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
