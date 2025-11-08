import { useState } from 'react';
import { Wallet } from 'lucide-react';
import WalletSelectionModal from './WalletSelectionModal';

interface ConnectWalletProps {
  onConnect: (walletName: string, address: string) => void;
}

export default function ConnectWallet({ onConnect }: ConnectWalletProps) {
  const [showWalletModal, setShowWalletModal] = useState(false);

  const handleWalletSelect = (walletName: string, address: string) => {
    setShowWalletModal(false);
    onConnect(walletName, address);
  };

  return (
    <>
      <div className="min-h-screen w-full gradient-blue relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: 'url(/imgback.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        />

        <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-md">
            <div className="glass-card rounded-3xl p-8 md:p-10 shadow-2xl">
              <div className="flex justify-center mb-8">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg">
                  <Wallet className="w-10 h-10 text-white" />
                </div>
              </div>

              <h1 className="text-3xl md:text-4xl font-bold text-center text-white mb-3">
                DEMO CARDANO DASHBOARD
              </h1>
              <p className="text-blue-200 text-center mb-2">
                Connect your wallet to access your dashboard
              </p>
              <p className="text-blue-300 text-sm text-center mb-10">
                Only Preprod Network
              </p>

              <button
                onClick={() => setShowWalletModal(true)}
                className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-300 transform hover:scale-105 hover:shadow-xl mb-6"
              >
                Connect Wallet
              </button>


              <div className="mt-8 pt-6 border-t border-blue-400/20">
                <p className="text-center text-blue-300 text-sm">
                For Demo session purpose only
                </p>
              </div>
            </div>

            <p className="text-center text-blue-300 text-sm mt-6">
              <a href="#">Github repository public</a>
            </p>
          </div>
        </div>
      </div>

      <WalletSelectionModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        onSelectWallet={handleWalletSelect}
      />
    </>
  );
}
