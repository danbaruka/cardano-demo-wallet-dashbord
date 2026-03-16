import { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  Send,
  History,
  LogOut,
  ArrowUpRight,
  ArrowDownRight,
  PieChart,
  CheckCircle,
  RefreshCw,
  Coins,
  Home,
  Plus,
  Flame,
  Copy,
  ExternalLink
} from 'lucide-react';
import { useWallet, useAssets, useLovelace } from '@meshsdk/react';
import { Transaction } from '@meshsdk/core';
import { toast } from 'react-toastify';
import TransactionModal from './TransactionModal';
import MintTokenModal from './MintTokenModal';
import BurnTokenModal from './BurnTokenModal';
import SendTokenModal from './SendTokenModal';
import { fetchAddressTransactions, ProcessedTransaction, fetchAssetMetadata } from '../services/koios';
import { ADDRESS_PREFIX, CARDANO_NETWORK, CARDANOSCANNER_BASE } from '../config';
import { parseAssetUnit } from '../services/nativeTokens';

interface DashboardProps {
  onDisconnect: () => void;
  walletAddress: string;
  isRestoring?: boolean;
}

export default function Dashboard({ onDisconnect, walletAddress: propsWalletAddress, isRestoring = false }: DashboardProps) {
  const { wallet, connected, disconnect } = useWallet();
  const assets = useAssets();
  const lovelaceFromHook = useLovelace();
  
  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [txStatus, setTxStatus] = useState<'idle' | 'validating' | 'signing' | 'broadcasting' | 'success' | 'error'>('idle');
  const [selectedTransaction, setSelectedTransaction] = useState<ProcessedTransaction | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<ProcessedTransaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [walletAddress, setWalletAddress] = useState(propsWalletAddress);
  const [estimatedFee, setEstimatedFee] = useState('~0.17');
  const [lovelace, setLovelace] = useState<number | null>(null);
  const [activeMenu, setActiveMenu] = useState<'transactions' | 'native-tokens'>('transactions');
  const [showMintModal, setShowMintModal] = useState(false);
  const [showBurnModal, setShowBurnModal] = useState(false);
  const [showSendTokenModal, setShowSendTokenModal] = useState(false);
  const [sendTokenMode, setSendTokenMode] = useState(false); // Toggle between ADA and token sending
  const [copiedPolicyId, setCopiedPolicyId] = useState<string | null>(null);
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, { name?: string; symbol?: string; image?: string; description?: string }>>({});

  // Validate address by network prefix
  const validateNetworkAddress = (address: string): boolean => {
    return address.startsWith(ADDRESS_PREFIX);
  };

  // Fetch balance manually from wallet
  const fetchBalance = useCallback(async () => {
    if (!connected || !wallet) {
      console.log('Cannot fetch balance: connected=', connected, 'wallet=', !!wallet);
      return;
    }
    
    setIsLoadingBalance(true);
    try {
      console.log('Fetching balance from wallet...');
      
      // Try multiple methods to get balance
      let totalLovelace = 0;
      
      // Method 1: Try getUtxos and calculate from UTXOs
      try {
        const utxos = await wallet.getUtxos();
        console.log('UTXOs received:', utxos?.length || 0);
        
        if (utxos && Array.isArray(utxos) && utxos.length > 0) {
          utxos.forEach((utxo: any) => {
            // Handle different UTXO formats
            if (utxo.output) {
              // CIP-30 format
              if (utxo.output.amount) {
                const amounts = Array.isArray(utxo.output.amount) ? utxo.output.amount : [utxo.output.amount];
                amounts.forEach((amt: any) => {
                  if (amt) {
                    // Check if it's lovelace (unit might be 'lovelace' or undefined/empty for native asset)
                    if (!amt.unit || amt.unit === 'lovelace' || amt.unit === '') {
                      const quantity = typeof amt.quantity === 'string' ? parseInt(amt.quantity, 10) : (typeof amt.quantity === 'number' ? amt.quantity : 0);
                      totalLovelace += quantity || 0;
                    }
                  }
                });
              } else if (utxo.output.value) {
                // Alternative format
                const value = typeof utxo.output.value === 'string' ? parseInt(utxo.output.value, 10) : (typeof utxo.output.value === 'number' ? utxo.output.value : 0);
                totalLovelace += value || 0;
              }
            } else if (utxo.amount) {
              // Direct amount in UTXO
              const amounts = Array.isArray(utxo.amount) ? utxo.amount : [utxo.amount];
              amounts.forEach((amt: any) => {
                if (amt && (!amt.unit || amt.unit === 'lovelace')) {
                  const quantity = typeof amt.quantity === 'string' ? parseInt(amt.quantity, 10) : (typeof amt.quantity === 'number' ? amt.quantity : 0);
                  totalLovelace += quantity || 0;
                }
              });
            }
          });
        }
      } catch (utxoError) {
        console.warn('Error getting UTXOs:', utxoError);
      }
      
      console.log('Calculated balance from UTXOs:', totalLovelace);
      
      // Method 2: Try getBalance if available
      if (totalLovelace === 0 && (wallet as any).getBalance) {
        try {
          const balance = await (wallet as any).getBalance();
          if (balance && typeof balance === 'number') {
            totalLovelace = balance;
            console.log('Got balance from getBalance():', totalLovelace);
          }
        } catch (balanceError) {
          console.warn('Error getting balance:', balanceError);
        }
      }
      
      // Method 3: Use hook value as final fallback
      if (totalLovelace === 0 && lovelaceFromHook && typeof lovelaceFromHook === 'number' && lovelaceFromHook > 0) {
        totalLovelace = lovelaceFromHook;
        console.log('Using hook value as fallback:', totalLovelace);
      }
      
      if (totalLovelace > 0) {
        console.log('Setting lovelace balance:', totalLovelace);
        setLovelace(totalLovelace);
      } else {
        console.warn('Balance is 0 or not available. Hook value:', lovelaceFromHook);
      }
    } catch (error) {
      console.error('Error fetching balance:', error);
      // Final fallback to hook value
      if (lovelaceFromHook && typeof lovelaceFromHook === 'number') {
        setLovelace(lovelaceFromHook);
      }
    } finally {
      setIsLoadingBalance(false);
    }
  }, [connected, wallet, lovelaceFromHook]);

  // Get wallet address from MeshJS if available
  useEffect(() => {
    const fetchWalletAddress = async () => {
      if (connected && wallet) {
        try {
          const addresses = await wallet.getUsedAddresses();
          if (addresses && addresses.length > 0) {
            const address = addresses[0];
            // Validate network per config
            if (!validateNetworkAddress(address)) {
              toast.error(`Only ${CARDANO_NETWORK} network is supported. Please switch your wallet to ${CARDANO_NETWORK}.`);
              await disconnect();
              onDisconnect();
              return;
            }
            setWalletAddress(address);
          }
        } catch (error) {
          console.error('Error fetching wallet address:', error);
        }
      }
    };
    fetchWalletAddress();
  }, [connected, wallet, disconnect, onDisconnect]);

  // Fetch balance when wallet is connected (not during restoration)
  useEffect(() => {
    if (connected && wallet && !isRestoring) {
      console.log('Wallet connected, fetching balance...');
      fetchBalance();
      
      // Also set up a periodic refresh every 10 seconds
      const intervalId = setInterval(() => {
        if (connected && wallet) {
          fetchBalance();
        }
      }, 10000);
      
      return () => clearInterval(intervalId);
    }
  }, [connected, wallet, isRestoring, fetchBalance]);

  // Fetch balance once restoration is complete
  useEffect(() => {
    if (!isRestoring && connected && wallet) {
      console.log('Restoration complete, fetching balance...');
      setTimeout(() => {
        fetchBalance();
      }, 500);
    }
  }, [isRestoring, connected, wallet, fetchBalance]);

  // Also sync with hook value when it becomes available
  useEffect(() => {
    if (lovelaceFromHook && typeof lovelaceFromHook === 'number' && (!lovelace || lovelace === 0)) {
      console.log('Syncing with hook value:', lovelaceFromHook);
      setLovelace(lovelaceFromHook);
    }
  }, [lovelaceFromHook, lovelace]);

  // Copy policy ID to clipboard
  const handleCopyPolicyId = (policyId: string) => {
    navigator.clipboard.writeText(policyId);
    setCopiedPolicyId(policyId);
    toast.success('Policy ID copied to clipboard');
    setTimeout(() => setCopiedPolicyId(null), 2000);
  };

  // Format address for display
  const displayAddress = walletAddress 
    ? `${walletAddress.slice(0, 13)}...${walletAddress.slice(-8)}` 
    : 'Loading...';

  // Convert lovelace to ADA
  const adaBalance = lovelace && typeof lovelace === 'number' ? (lovelace / 1_000_000).toFixed(2) : '0.00';
  const formattedBalance = parseFloat(adaBalance).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Fetch transaction history
  const fetchTransactions = useCallback(async () => {
    if (!walletAddress || !connected) return;
    
    setIsLoadingTransactions(true);
    try {
      const txs = await fetchAddressTransactions(walletAddress);
      setRecentTransactions(txs);
    } catch (error: any) {
      // Don't show error for rate limiting - just skip transaction history
      if (error?.message?.includes('429') || 
          error?.message?.includes('Too Many Requests') ||
          error?.message?.includes('Rate limited')) {
        // Silently skip - user can retry later
        setRecentTransactions([]);
      } else {
        console.error('Error fetching transactions:', error);
        toast.error('Failed to load transaction history');
      }
    } finally {
      setIsLoadingTransactions(false);
    }
  }, [walletAddress, connected]);

  // Load transactions on mount and when address changes
  useEffect(() => {
    if (walletAddress && connected) {
      fetchTransactions();
    }
  }, [walletAddress, connected, fetchTransactions]);

  // Process assets for display
  const processedAssets = (Array.isArray(assets) ? assets : [])
    .filter((asset) => asset.unit !== 'lovelace') // Exclude ADA as it's shown separately
    .slice(0, 10)
    .map((asset) => {
      const quantity = parseFloat(asset.quantity || '0');
      const formattedQuantity = quantity.toLocaleString('en-US', {
        maximumFractionDigits: asset.quantity?.includes('.') ? 6 : 0,
      });
      return {
        name: (asset as any).assetName || asset.unit.slice(0, 8),
        amount: formattedQuantity,
        value: '-', // Asset pricing not available without external API
        unit: asset.unit,
      };
    });

  // Process native tokens for native tokens view
  const nativeTokens = (Array.isArray(assets) ? assets : [])
    .filter((asset) => asset.unit !== 'lovelace')
    .map((asset) => {
      try {
        const { policyId, assetName } = parseAssetUnit(asset.unit);
        const quantity = parseFloat(asset.quantity || '0');
        // Convert hex to string if possible
        let displayName = asset.unit.slice(56, 64);
        if (assetName && assetName.length > 0) {
          try {
            // Try to decode hex to UTF-8 string
            const hexString = assetName;
            // Use TextDecoder for proper UTF-8 decoding
            const bytes = new Uint8Array(
              hexString.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
            );
            const decoder = new TextDecoder('utf-8', { fatal: false });
            const decoded = decoder.decode(bytes);
            
            // Check if decoded string is valid (not just control characters or null bytes)
            const cleanDecoded = decoded.replace(/\0/g, '').trim();
            if (cleanDecoded.length > 0 && /[\w\s\-_]/.test(cleanDecoded)) {
              displayName = cleanDecoded;
            } else {
              // Fallback: try simple ASCII decode
              let asciiDecoded = '';
              for (let i = 0; i < hexString.length; i += 2) {
                const charCode = parseInt(hexString.substr(i, 2), 16);
                if (charCode >= 32 && charCode < 127) { // Printable ASCII
                  asciiDecoded += String.fromCharCode(charCode);
                }
              }
              if (asciiDecoded.trim().length > 0) {
                displayName = asciiDecoded.trim();
              }
            }
          } catch (e) {
            // Keep hex display if decode fails
            console.warn('Failed to decode asset name:', assetName, e);
          }
        }
        return {
          unit: asset.unit,
          policyId,
          assetName: displayName, // This is the decoded name, not hex
          quantity: quantity.toLocaleString('en-US', {
            maximumFractionDigits: asset.quantity?.includes('.') ? 6 : 0,
          }),
          rawQuantity: asset.quantity || '0',
        };
      } catch (error) {
        return {
          unit: asset.unit,
          policyId: asset.unit.slice(0, 56),
          assetName: asset.unit.slice(56, 64),
          quantity: parseFloat(asset.quantity || '0').toLocaleString(),
          rawQuantity: asset.quantity || '0',
        };
      }
    });

  // Fetch metadata for native tokens with debouncing and rate limit handling
  useEffect(() => {
    // Debounce metadata fetching to avoid rate limits
    const timeoutId = setTimeout(async () => {
      if (!connected || nativeTokens.length === 0) return;

      // Skip metadata fetching if we have too many tokens (to avoid rate limits)
      // Only fetch for first few tokens, or skip entirely if rate limited
      const tokensToFetch = nativeTokens.slice(0, 5); // Limit to first 5 tokens

      // Batch requests with delay to avoid rate limiting
      const fetchWithDelay = async (token: typeof nativeTokens[0], delay: number) => {
        await new Promise(resolve => setTimeout(resolve, delay));
        
        try {
          const { policyId, assetName } = parseAssetUnit(token.unit);
          const metadata = await fetchAssetMetadata(policyId, assetName);
          
          if (metadata) {
            // Get image URL from metadata
            let imageUrl = metadata.image;
            
            // Process image URL - handle IPFS protocol and construct full URL if needed
            if (imageUrl) {
              // Remove any IPFS protocol prefix if present
              imageUrl = imageUrl.replace(/^ipfs:\/\//, '');
              
              // If it's just a hash (no http), construct the full IPFS gateway URL
              if (!imageUrl.startsWith('http')) {
                imageUrl = `https://gateway.lighthouse.storage/ipfs/${imageUrl}`;
              }
              
              // Try to validate it's an image (but don't block - let img tag handle errors)
              try {
                const img = new Image();
                await new Promise((resolve, reject) => {
                  img.onload = resolve;
                  img.onerror = reject;
                  img.src = imageUrl;
                  setTimeout(() => reject(new Error('Timeout')), 5000);
                });
              } catch (error) {
                // If validation fails, still try to use it (might be CORS or network issue)
                // The img tag's onError will handle display fallback
              }
            }

            return {
              unit: token.unit,
              metadata: {
                name: metadata.name,
                symbol: metadata.symbol,
                image: imageUrl,
                description: metadata.description,
              },
            };
          }
        } catch (error: any) {
          // Silently handle rate limit errors - don't log them
          if (error?.message?.includes('429') || 
              error?.message?.includes('Too Many Requests') ||
              error?.message?.includes('Rate limited')) {
            // Rate limited - skip this token
            return null;
          }
        }
        return null;
      };

      // Fetch metadata with staggered delays to avoid rate limits (3 seconds between requests)
      const metadataPromises = tokensToFetch.map((token, index) => 
        fetchWithDelay(token, index * 3000) // 3 second delay between each request
      );

      const results = await Promise.all(metadataPromises);
      const newMetadata: Record<string, { name?: string; symbol?: string; image?: string; description?: string }> = {};
      
      results.forEach((result) => {
        if (result && result.metadata) {
          newMetadata[result.unit] = result.metadata;
        }
      });

      setTokenMetadata(newMetadata);
    }, 2000); // Debounce by 2 seconds

    return () => clearTimeout(timeoutId);
  }, [nativeTokens, connected]);

  // Add ADA as first asset
  const allAssets = [
    {
      name: 'tADA',
      amount: formattedBalance,
      value: '-', // Could integrate price API here
      unit: 'lovelace',
    },
    ...processedAssets,
  ];

  const handleSend = async () => {
    if (!recipientAddress || !amount || !wallet || !connected) {
      toast.error('Please ensure wallet is connected and all fields are filled');
      return;
    }

    // Validate address format for current network
    if (!recipientAddress.startsWith(ADDRESS_PREFIX) || recipientAddress.length < 50) {
      toast.error(`Invalid address format. Only ${CARDANO_NETWORK} addresses (${ADDRESS_PREFIX}...) are allowed.`);
      return;
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    // Check balance
    const amountInLovelace = Math.floor(amountNum * 1_000_000);
    const currentBalance = typeof lovelace === 'number' ? lovelace : 0;
    if (amountInLovelace > currentBalance) {
      toast.error('Insufficient balance');
      return;
    }

    setIsProcessing(true);
    setTxStatus('validating');

    try {
      // Create transaction
      const tx = new Transaction({ initiator: wallet });
      
      // Send lovelace
      setTxStatus('signing');
      tx.sendLovelace(recipientAddress, amountInLovelace.toString());

      // Add memo if provided
      if (memo && memo.trim()) {
        // Note: Memo functionality requires additional setup in MeshJS
        // For now, we'll skip memo to keep it simple
      }

      // Build transaction
      const unsignedTx = await tx.build();
      
      // Estimate fee (approximate)
      const txSize = unsignedTx.length;
      const estimatedFeeLovelace = Math.max(170000, txSize * 44); // Rough estimate
      setEstimatedFee((estimatedFeeLovelace / 1_000_000).toFixed(2));

      // Sign transaction
      const signedTx = await wallet.signTx(unsignedTx);
      
      // Submit transaction
      setTxStatus('broadcasting');
      const txHash = await wallet.submitTx(signedTx);

      setTxStatus('success');

      toast.success(`Transaction submitted! Hash: ${txHash.slice(0, 8)}...`);

      // Reset form
      setTimeout(() => {
        setTxStatus('idle');
        setRecipientAddress('');
        setAmount('');
        setMemo('');
      }, 3000);

      // Refresh transactions and balance after a short delay
      setTimeout(() => {
        fetchTransactions();
        fetchBalance(); // Refresh balance after transaction
      }, 2000);

    } catch (error: any) {
      console.error('Transaction error:', error);
      setTxStatus('error');
      toast.error(error?.message || 'Transaction failed. Please try again.');
      
      setTimeout(() => {
        setTxStatus('idle');
      }, 3000);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMaxAmount = () => {
    if (lovelace && typeof lovelace === 'number') {
      // Reserve ~0.2 ADA for fees
      const maxLovelace = lovelace - 200000;
      const maxAda = Math.max(0, maxLovelace / 1_000_000);
      setAmount(maxAda.toFixed(2));
    }
  };

  const getStatusMessage = () => {
    switch (txStatus) {
      case 'validating': return 'Validating transaction...';
      case 'signing': return 'Signing transaction...';
      case 'broadcasting': return 'Broadcasting to network...';
      case 'success': return 'Transaction successful!';
      case 'error': return 'Transaction failed';
      default: return '';
    }
  };

  return (
    <div className="min-h-screen w-full gradient-blue relative overflow-hidden flex flex-col">
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: 'url(/imgback.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />

      <div className="relative z-10 flex-1 flex flex-col">
        <nav className="glass-card border-0 border-b border-blue-400/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-white" />
                </div>
                <span className="text-white font-bold text-lg hidden sm:block">Cardano Wallet</span>
              </div>

              <div className="flex items-center space-x-4">
                {/* Menu Navigation */}
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => setActiveMenu('transactions')}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg transition-all duration-200 ${
                      activeMenu === 'transactions'
                        ? 'bg-blue-500/30 text-white border border-blue-400/50'
                        : 'glass-card-hover text-blue-300 hover:text-white'
                    }`}
                  >
                    <Home className="w-4 h-4" />
                    <span className="text-sm font-medium">Transactions</span>
                  </button>
                  <button
                    onClick={() => setActiveMenu('native-tokens')}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg transition-all duration-200 ${
                      activeMenu === 'native-tokens'
                        ? 'bg-blue-500/30 text-white border border-blue-400/50'
                        : 'glass-card-hover text-blue-300 hover:text-white'
                    }`}
                  >
                    <Coins className="w-4 h-4" />
                    <span className="text-sm font-medium">Native-Tokens</span>
                  </button>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={async () => {
                      if (connected && disconnect) {
                        await disconnect();
                      }
                      onDisconnect();
                      toast.info('Wallet disconnected');
                    }}
                    className="flex items-center space-x-2 px-3 py-1.5 rounded-lg glass-card-hover text-blue-300 hover:text-white"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="hidden sm:inline text-sm">Disconnect</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </nav>

        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 md:py-6">
          <div className="mb-4">
            <h1 className="text-xl md:text-2xl font-bold text-white mb-1">
              {activeMenu === 'transactions' ? 'Transactions' : 'Native-Tokens'}
            </h1>
            {isRestoring ? (
              <div className="h-4 w-48 bg-blue-500/20 rounded animate-pulse"></div>
            ) : (
              <p className="text-blue-300 text-xs md:text-sm font-mono">{displayAddress}</p>
            )}
          </div>

          {activeMenu === 'transactions' ? (
            <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-6">
            <div className="glass-card rounded-xl p-6 md:p-8">
              <p className="text-blue-300 text-sm mb-2">Total Balance</p>
              {isRestoring ? (
                <>
                  <div className="h-12 bg-blue-500/20 rounded animate-pulse mb-2"></div>
                  <div className="h-6 w-24 bg-blue-500/20 rounded animate-pulse"></div>
                </>
              ) : (
                <>
                  <h2 className="text-4xl md:text-5xl font-bold text-white mb-2">{formattedBalance} tADA</h2>
                  <p className="text-xl md:text-2xl text-blue-300">{lovelace && typeof lovelace === 'number' ? `${(lovelace / 1_000_000).toFixed(6)} tADA` : '0.00 tADA'}</p>
                </>
              )}
            </div>

            <div className="lg:col-span-2 relative overflow-hidden rounded-2xl">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-cyan-500/5 to-transparent"></div>
              <div className="glass-card rounded-2xl p-6 md:p-8 relative">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg">
                      <Send className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-white font-bold text-lg md:text-xl">Send Tokens</h3>
                      <p className="text-blue-300/70 text-xs">
                        {sendTokenMode ? 'Send Native Tokens' : 'Transfer tADA securely'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        setSendTokenMode(false);
                        setShowSendTokenModal(false);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        !sendTokenMode
                          ? 'bg-blue-500/30 text-white border border-blue-400/50'
                          : 'glass-card-hover text-blue-300 hover:text-white'
                      }`}
                      disabled={isProcessing}
                    >
                      Send ADA
                    </button>
                    <button
                      onClick={() => {
                        setSendTokenMode(true);
                        setShowSendTokenModal(true);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        sendTokenMode
                          ? 'bg-blue-500/30 text-white border border-blue-400/50'
                          : 'glass-card-hover text-blue-300 hover:text-white'
                      }`}
                      disabled={isProcessing}
                    >
                      Send Token
                    </button>
                  </div>
                  {txStatus !== 'idle' && (
                    <div className={`text-xs px-3 py-1.5 rounded-full font-medium backdrop-blur-sm ${
                      txStatus === 'success' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                      txStatus === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                      'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    }`}>
                      {getStatusMessage()}
                    </div>
                  )}
                </div>

                {isRestoring ? (
                  <div className="space-y-5">
                    <div className="h-12 bg-blue-500/20 rounded-xl animate-pulse"></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="h-12 bg-blue-500/20 rounded-xl animate-pulse"></div>
                      <div className="h-12 bg-blue-500/20 rounded-xl animate-pulse"></div>
                    </div>
                    <div className="h-12 bg-blue-500/20 rounded-xl animate-pulse"></div>
                    <div className="h-12 bg-blue-500/20 rounded-xl animate-pulse"></div>
                  </div>
                ) : !sendTokenMode ? (
                <div className="space-y-5">
                  <div className="relative">
                    <label className="text-blue-300 text-sm font-medium mb-2 block flex items-center space-x-2">
                      <span>Recipient Address</span>
                      <span className="text-xs text-blue-400/60">({`${CARDANO_NETWORK} Network`})</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={recipientAddress}
                        onChange={(e) => setRecipientAddress(e.target.value)}
                        placeholder={`${ADDRESS_PREFIX}...`}
                        className="w-full bg-blue-950/60 border-2 border-blue-400/20 rounded-xl px-4 py-3.5 text-white text-base placeholder-blue-400/40 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all duration-300 font-mono"
                        disabled={isProcessing}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-2 h-2 rounded-full bg-blue-400/50 animate-pulse"></div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="relative">
                      <label className="text-blue-300 text-sm font-medium mb-2 block">Amount</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-blue-950/60 border-2 border-blue-400/20 rounded-xl px-4 py-3.5 pr-16 text-white text-base placeholder-blue-400/40 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all duration-300"
                          disabled={isProcessing}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-2">
                          <span className="text-cyan-400 font-semibold text-sm">tADA</span>
                        </div>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between">
                        <button 
                          onClick={handleMaxAmount}
                          className="text-xs text-blue-400 hover:text-cyan-400 transition-colors" 
                          disabled={isProcessing || !lovelace || typeof lovelace !== 'number'}
                        >
                          Max: {formattedBalance} tADA
                        </button>
                      </div>
                    </div>
                    <div className="relative">
                      <label className="text-blue-300 text-sm font-medium mb-2 block flex items-center space-x-1">
                        <span>Transaction Fee</span>
                        <span className="text-xs text-blue-400/60">(estimated)</span>
                      </label>
                      <div className="bg-blue-950/60 border-2 border-blue-400/20 rounded-xl px-4 py-3.5 flex items-center justify-between">
                        <span className="text-white text-base">{estimatedFee}</span>
                        <span className="text-blue-300 text-sm">tADA</span>
                      </div>
                      <div className="mt-1.5 text-xs text-blue-400/60">
                        Network fee applies
                      </div>
                    </div>
                  </div>

                  <div className="relative">
                    <label className="text-blue-300 text-sm font-medium mb-2 block">Memo (Optional)</label>
                    <input
                      type="text"
                      value={memo}
                      onChange={(e) => setMemo(e.target.value)}
                      placeholder="Add a note to this transaction"
                      className="w-full bg-blue-950/60 border-2 border-blue-400/20 rounded-xl px-4 py-3.5 text-white text-base placeholder-blue-400/40 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all duration-300"
                      disabled={isProcessing}
                    />
                  </div>

                  {txStatus !== 'idle' && txStatus !== 'success' && (
                    <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-400/30 p-5">
                      <div className="flex items-center space-x-4">
                        <div className="relative">
                          <div className="animate-spin rounded-full h-8 w-8 border-3 border-cyan-400/30 border-t-cyan-400"></div>
                          <div className="absolute inset-0 rounded-full bg-cyan-400/20 blur-lg"></div>
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-white text-base font-semibold">{getStatusMessage()}</span>
                            <span className="text-cyan-400 text-sm font-bold">
                              {txStatus === 'validating' ? '33%' : txStatus === 'signing' ? '66%' : '99%'}
                            </span>
                          </div>
                          <div className="relative w-full bg-blue-950/60 rounded-full h-2.5 overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-cyan-400/20"></div>
                            <div
                              className="relative bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500 h-2.5 rounded-full transition-all duration-500 shadow-lg shadow-cyan-400/50"
                              style={{
                                width: txStatus === 'validating' ? '33%' : txStatus === 'signing' ? '66%' : '99%',
                                backgroundSize: '200% 100%',
                                animation: 'shimmer 2s infinite'
                              }}
                            />
                          </div>
                          <p className="text-blue-300 text-xs mt-2">Please wait while we process your transaction on the blockchain</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {txStatus === 'success' && (
                    <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/40 p-5">
                      <div className="flex items-center space-x-4">
                        <div className="relative">
                          <CheckCircle className="w-8 h-8 text-green-400 flex-shrink-0" />
                          <div className="absolute inset-0 rounded-full bg-green-400/30 blur-lg animate-pulse"></div>
                        </div>
                        <div className="flex-1">
                          <p className="text-green-400 font-bold text-base mb-1">Transaction Submitted!</p>
                          <p className="text-green-400/70 text-sm font-mono">Transaction has been broadcasted to the network</p>
                          <p className="text-green-300/60 text-xs mt-1">Please wait for confirmation. Refresh to see updated balance.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleSend}
                    disabled={!recipientAddress || !amount || isProcessing}
                    className="group relative w-full overflow-hidden bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600 hover:shadow-xl hover:shadow-cyan-500/30 disabled:from-blue-800 disabled:to-blue-700 disabled:cursor-not-allowed disabled:shadow-none text-white font-bold py-4 rounded-xl transition-all duration-300 text-base"
                    style={{ backgroundSize: '200% 100%' }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                    <span className="relative flex items-center justify-center space-x-2">
                      {isProcessing ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                          <span>Processing Transaction...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-5 h-5" />
                          <span>Send Transaction</span>
                        </>
                      )}
                    </span>
                  </button>
                </div>
                ) : (
                  <div className="p-8 text-center">
                    <p className="text-blue-300 text-sm mb-4">Click "Send Token" button above to send native tokens</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
            <div className="glass-card rounded-xl p-4 md:p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold text-sm md:text-base">Your Assets</h3>
                <PieChart className="w-4 h-4 text-blue-400" />
              </div>

              {isRestoring ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg">
                      <div className="flex items-center space-x-3 flex-1">
                        <div className="w-8 h-8 rounded-full bg-blue-500/20 animate-pulse"></div>
                        <div className="flex-1">
                          <div className="h-4 w-20 bg-blue-500/20 rounded animate-pulse mb-1"></div>
                          <div className="h-3 w-16 bg-blue-500/20 rounded animate-pulse"></div>
                        </div>
                      </div>
                      <div className="h-4 w-12 bg-blue-500/20 rounded animate-pulse"></div>
                    </div>
                  ))}
                </div>
              ) : (
              <div className="space-y-2">
                  {allAssets.length === 0 ? (
                    <div className="p-4 rounded-lg glass-card-hover text-center">
                      <p className="text-blue-300 text-sm">No assets found</p>
                    </div>
                  ) : (
                    allAssets.map((asset, index) => (
                      <div
                        key={asset.unit || index}
                    className="flex items-center justify-between p-3 rounded-lg glass-card-hover"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-xs">{asset.name[0]}</span>
                      </div>
                      <div>
                        <p className="text-white font-semibold text-sm">{asset.name}</p>
                        <p className="text-blue-300 text-xs">{asset.amount}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-semibold text-sm">{asset.value}</p>
                    </div>
                  </div>
                    ))
                  )}
              </div>
              )}
            </div>

            <div className="glass-card rounded-xl p-4 md:p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold text-sm md:text-base">Recent Transactions</h3>
                <div className="flex items-center space-x-2">
                  {!isRestoring && (
                    <button
                      onClick={fetchTransactions}
                      disabled={isLoadingTransactions}
                      className="p-1 rounded-lg glass-card-hover text-blue-300 hover:text-white transition-colors disabled:opacity-50"
                      title="Refresh transactions"
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoadingTransactions ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                <History className="w-4 h-4 text-blue-400" />
                </div>
              </div>

              {isRestoring || isLoadingTransactions ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg">
                      <div className="flex items-center space-x-3 flex-1">
                        <div className="w-8 h-8 rounded-full bg-blue-500/20 animate-pulse"></div>
                        <div className="flex-1">
                          <div className="h-4 w-16 bg-blue-500/20 rounded animate-pulse mb-1"></div>
                          <div className="h-3 w-20 bg-blue-500/20 rounded animate-pulse"></div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="h-4 w-16 bg-blue-500/20 rounded animate-pulse mb-1"></div>
                        <div className="h-3 w-12 bg-blue-500/20 rounded animate-pulse"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
              <div className="space-y-2">
                  {recentTransactions.length === 0 ? (
                    <div className="p-4 rounded-lg glass-card-hover text-center">
                      <p className="text-blue-300 text-sm">No transactions found</p>
                    </div>
                  ) : (
                    recentTransactions.slice(0, 10).map((tx) => (
                      <div
                        key={tx.id || tx.fullHash}
                    onClick={() => setSelectedTransaction(tx)}
                    className="flex items-center justify-between p-3 rounded-lg glass-card-hover cursor-pointer"
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        tx.type === 'receive'
                          ? 'bg-green-500/20 border border-green-500/30'
                          : 'bg-red-500/20 border border-red-500/30'
                      }`}>
                        {tx.type === 'receive' ? (
                          <ArrowDownRight className="w-4 h-4 text-green-400" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4 text-red-400" />
                        )}
                      </div>
                      <div>
                        <p className="text-white font-semibold text-sm capitalize">{tx.type}</p>
                        <p className="text-blue-300 text-xs">{tx.date}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold text-sm ${
                        tx.type === 'receive' ? 'text-green-400' : 'text-red-400'
                      }`}>
                            {tx.amount} tADA
                      </p>
                      <p className="text-blue-300 text-xs">{tx.hash}</p>
                    </div>
                  </div>
                    ))
                  )}
              </div>
              )}

              {!isRestoring && recentTransactions.length > 10 && (
              <button className="w-full mt-3 py-2 rounded-lg glass-card-hover text-blue-300 hover:text-white font-semibold transition-colors text-sm">
                  View All ({recentTransactions.length})
              </button>
              )}
            </div>
          </div>
          </>
          ) : (
            <div className="space-y-6">
              {/* Action Buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div>
                    <h2 className="text-xl md:text-2xl font-bold text-white mb-1">Native Tokens</h2>
                    <p className="text-blue-300 text-xs md:text-sm">Manage your Cardano native tokens</p>
                  </div>
                  {!isRestoring && (
                    <button
                      onClick={fetchBalance}
                      disabled={isRestoring || isLoadingBalance}
                      className="p-2 rounded-lg glass-card-hover text-blue-300 hover:text-white transition-colors disabled:opacity-50"
                      title="Refresh native tokens"
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoadingBalance ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowMintModal(true)}
                    disabled={isRestoring}
                    className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="text-sm">Mint</span>
                  </button>
                  <button
                    onClick={() => setShowBurnModal(true)}
                    disabled={isRestoring || nativeTokens.length === 0}
                    className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Flame className="w-4 h-4" />
                    <span className="text-sm">Burn</span>
                  </button>
                </div>
              </div>

              {/* Token List */}
              {isRestoring ? (
                <div className="glass-card rounded-xl p-6">
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-16 bg-blue-500/20 rounded-xl animate-pulse"></div>
                    ))}
                  </div>
                </div>
              ) : nativeTokens.length === 0 ? (
                <div className="glass-card rounded-xl p-12 text-center">
                  <Coins className="w-16 h-16 text-blue-400/40 mx-auto mb-4" />
                  <p className="text-blue-300 text-lg font-semibold mb-2">No Native Tokens</p>
                  <p className="text-blue-400/60 text-sm mb-6">Mint your first native token to get started</p>
                  <button
                    onClick={() => setShowMintModal(true)}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold transition-all"
                  >
                    Mint Token
                  </button>
                </div>
              ) : (
                <div className="glass-card rounded-xl p-6">
                  <div className="space-y-4">
                    {nativeTokens.map((token) => {
                      const explorerUrl = `${CARDANOSCANNER_BASE}/tokenPolicy/${token.policyId}`;
                      const isCopied = copiedPolicyId === token.policyId;
                      
                      return (
                        <div
                          key={token.unit}
                          className="flex items-center justify-between p-5 rounded-xl bg-blue-950/40 border border-blue-400/20 hover:border-cyan-400/40 transition-all"
                        >
                          <div className="flex items-center space-x-4 flex-1">
                            {/* Token Image/Icon */}
                            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                              {tokenMetadata[token.unit]?.image ? (
                                <img
                                  src={tokenMetadata[token.unit].image}
                                  alt={tokenMetadata[token.unit]?.name || token.assetName}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    // Hide image on error - fallback will show
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                  }}
                                />
                              ) : null}
                              {/* Fallback initial - always present but hidden when image is shown */}
                              <span 
                                className="text-white font-bold text-lg absolute inset-0 flex items-center justify-center"
                                style={{ display: tokenMetadata[token.unit]?.image ? 'none' : 'flex' }}
                              >
                                {(tokenMetadata[token.unit]?.name || token.assetName || 'T')[0]?.toUpperCase() || 'T'}
                              </span>
                            </div>
                            
                            {/* Token Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2">
                                <p className="text-white font-semibold text-base truncate">
                                  {tokenMetadata[token.unit]?.name || token.assetName || 'Unknown Token'}
                                </p>
                                {tokenMetadata[token.unit]?.symbol && (
                                  <span className="text-blue-300 text-sm font-medium px-2 py-0.5 rounded bg-blue-500/20">
                                    {tokenMetadata[token.unit].symbol}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center space-x-2 mt-1">
                                <p className="text-blue-300 text-xs font-mono truncate">
                                  Policy: {token.policyId.slice(0, 16)}...
                                </p>
                                <button
                                  onClick={() => handleCopyPolicyId(token.policyId)}
                                  className="p-1 rounded hover:bg-blue-500/20 transition-colors flex-shrink-0"
                                  title="Copy Policy ID"
                                >
                                  {isCopied ? (
                                    <CheckCircle className="w-3 h-3 text-green-400" />
                                  ) : (
                                    <Copy className="w-3 h-3 text-blue-300" />
                                  )}
                                </button>
                                <a
                                  href={explorerUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 rounded hover:bg-blue-500/20 transition-colors flex-shrink-0"
                                  title="View in Explorer"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="w-3 h-3 text-blue-300" />
                                </a>
                              </div>
                              {tokenMetadata[token.unit]?.description && (
                                <p className="text-blue-400/60 text-xs mt-1 truncate">
                                  {tokenMetadata[token.unit].description}
                                </p>
                              )}
                            </div>
                          </div>
                          
                          {/* Quantity */}
                          <div className="text-right ml-4">
                            <p className="text-white font-bold text-lg">{token.quantity}</p>
                            <p className="text-blue-400/60 text-xs mt-1">Available</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        <footer className="relative z-10 border-t border-blue-400/10 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <p className="text-center text-blue-300/60 text-xs">
              test project for devex demo
            </p>
          </div>
        </footer>
      </div>

      <TransactionModal
        transaction={selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
      />

      <MintTokenModal
        isOpen={showMintModal}
        onClose={() => setShowMintModal(false)}
        onSuccess={() => {
          // Refresh assets/balance
          fetchBalance();
        }}
      />

      <BurnTokenModal
        isOpen={showBurnModal}
        onClose={() => setShowBurnModal(false)}
        onSuccess={() => {
          // Refresh assets/balance
          fetchBalance();
        }}
      />

      <SendTokenModal
        isOpen={showSendTokenModal}
        onClose={() => {
          setShowSendTokenModal(false);
          setSendTokenMode(false);
        }}
        onSuccess={() => {
          // Refresh transactions and balance
          fetchTransactions();
          fetchBalance();
        }}
      />
    </div>
  );
}
