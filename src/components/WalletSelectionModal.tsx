import { X, Wallet } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useWalletList, useWallet } from '@meshsdk/react';
import { toast } from 'react-toastify';
import { ADDRESS_PREFIX, CARDANO_NETWORK } from '../config';

interface WalletSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectWallet: (walletName: string, address: string) => void;
}

const walletIcons: Record<string, string> = {
  'nami': '🦎',
  'eternl': '♾️',
  'flint': '🔥',
  'typhon': '🌪️',
  'yoroi': '🦋',
  'gero': '💎',
  'nufi': '🔷',
  'vespr': '🕷️',
  'lace': '🎴',
  'begin': '🌱',
};

export default function WalletSelectionModal({ isOpen, onClose, onSelectWallet }: WalletSelectionModalProps) {
  const wallets = useWalletList();
  const { connect, connecting, wallet, connected, disconnect } = useWallet();
  const connectingWalletName = useRef<string | null>(null);

  // Validate address by network prefix
  const validateNetworkAddress = (address: string): boolean => {
    return address.startsWith(ADDRESS_PREFIX);
  };

  // Handle successful connection
  useEffect(() => {
    const handleConnectionSuccess = async () => {
      if (connected && wallet && connectingWalletName.current) {
        try {
          const addresses = await wallet.getUsedAddresses();
          const address = addresses[0];
          
          if (address) {
            // Validate network per config
            if (!validateNetworkAddress(address)) {
              await disconnect();
              toast.error(`Only ${CARDANO_NETWORK} network is supported. Please switch your wallet to ${CARDANO_NETWORK}.`);
              connectingWalletName.current = null;
              return;
            }
            
            toast.success(`Connected to ${connectingWalletName.current}`);
            onSelectWallet(connectingWalletName.current, address);
            onClose();
            connectingWalletName.current = null;
          }
        } catch (error: any) {
          console.error('Error getting wallet address:', error);
          toast.error('Failed to get wallet address');
          connectingWalletName.current = null;
        }
      }
    };

    handleConnectionSuccess();
  }, [connected, wallet, disconnect, onSelectWallet, onClose]);

  if (!isOpen) return null;

  const handleWalletClick = async (walletName: string) => {
    try {
      connectingWalletName.current = walletName;
      await connect(walletName);
    } catch (error: any) {
      console.error('Wallet connection error:', error);
      toast.error(error?.message || `Failed to connect to ${walletName}`);
      connectingWalletName.current = null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-4xl glass-card rounded-2xl p-6 md:p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-white">Select Wallet</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg glass-card-hover text-blue-300 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-blue-300 text-sm mb-6">
          Choose your preferred Cardano wallet to connect
        </p>

        {wallets.length === 0 ? (
          <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-400/20">
            <p className="text-blue-300 text-sm text-center">
              No wallets detected. Please install a Cardano wallet extension.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-3">
            {wallets.map((walletItem) => {
              const walletKey = walletItem.name.toLowerCase();
              // Use wallet.icon from MeshJS if available (could be string URL or data URI), otherwise fallback to emoji
              const walletIconUrl = walletItem.icon && typeof walletItem.icon === 'string' 
                ? walletItem.icon 
                : (walletItem.icon as any)?.src || null;
              const fallbackIcon = walletIcons[walletKey] || '💼';
              const isInstalled = (walletItem as any).installed !== false;
              const isConnecting = connecting && connectingWalletName.current === walletItem.name;
              
              return (
                <button
                  key={walletItem.name}
                  onClick={() => handleWalletClick(walletItem.name)}
                  disabled={connecting || !isInstalled}
                  className="group relative p-2.5 md:p-3 rounded-lg glass-card-hover text-center transition-all duration-300 hover:scale-[1.05] hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex flex-col items-center justify-center space-y-2"
                >
                  <div className="relative w-10 h-10 md:w-12 md:h-12">
                    {walletIconUrl ? (
                      <img 
                        src={walletIconUrl} 
                        alt={walletItem.name}
                        className="w-full h-full rounded-lg object-contain"
                        onError={(e) => {
                          // Fallback to emoji container if image fails to load
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.parentElement?.querySelector('.wallet-icon-fallback');
                          if (fallback) {
                            (fallback as HTMLElement).style.display = 'flex';
                          }
                        }}
                      />
                    ) : null}
                    <div 
                      className={`wallet-icon-fallback w-full h-full rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-400/20 border border-blue-400/30 flex items-center justify-center text-xl md:text-2xl ${walletIconUrl ? 'hidden' : ''}`}
                    >
                      {fallbackIcon}
                    </div>
                    {isConnecting && (
                      <div className="absolute inset-0 flex items-center justify-center bg-blue-500/20 rounded-lg backdrop-blur-sm">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-cyan-400 border-t-transparent"></div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-col items-center space-y-0.5 w-full">
                    <p className="text-white font-semibold text-xs capitalize leading-tight">{walletItem.name}</p>
                    {isInstalled ? (
                      <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                        Available
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                        Install
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-6 p-4 rounded-xl bg-blue-500/10 border border-blue-400/20">
          <p className="text-blue-300 text-xs text-center">
            Don't have a wallet? Visit the official Cardano website to download one.
          </p>
        </div>
      </div>
    </div>
  );
}
