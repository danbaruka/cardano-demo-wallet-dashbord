import { X, ExternalLink, Copy, CheckCircle, Clock } from 'lucide-react';
import { useState } from 'react';
import { ProcessedTransaction } from '../services/koios';
import { CARDANOSCANNER_BASE } from '../config';

interface TransactionModalProps {
  transaction: ProcessedTransaction | null;
  onClose: () => void;
}

export default function TransactionModal({ transaction, onClose }: TransactionModalProps) {
  const [copied, setCopied] = useState(false);

  if (!transaction) return null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const explorerUrl = `${CARDANOSCANNER_BASE}/transaction/${transaction.fullHash}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl glass-card rounded-2xl p-6 md:p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl md:text-2xl font-bold text-white">Transaction Details</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg glass-card-hover text-blue-300 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 rounded-xl bg-blue-500/10 border border-blue-400/20">
            <div className="flex items-center space-x-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                transaction.type === 'receive'
                  ? 'bg-green-500/20 border border-green-500/30'
                  : 'bg-red-500/20 border border-red-500/30'
              }`}>
                <span className="text-2xl font-bold ${transaction.type === 'receive' ? 'text-green-400' : 'text-red-400'}">
                  {transaction.type === 'receive' ? '+' : '-'}
                </span>
              </div>
              <div>
                <p className="text-blue-300 text-sm mb-1 capitalize">{transaction.type}</p>
                <p className={`text-2xl font-bold ${
                  transaction.type === 'receive' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {transaction.amount} tADA
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-green-500/20 border border-green-500/30">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-green-400 text-sm font-medium capitalize">{transaction.status}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-400/20">
              <p className="text-blue-300 text-xs mb-2">Confirmations</p>
              <p className="text-white font-semibold text-lg">{transaction.confirmations}</p>
            </div>
            <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-400/20">
              <p className="text-blue-300 text-xs mb-2">Block Height</p>
              <p className="text-white font-semibold text-lg">{transaction.blockHeight.toLocaleString()}</p>
            </div>
            <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-400/20">
              <p className="text-blue-300 text-xs mb-2">Fee</p>
              <p className="text-white font-semibold text-lg">{transaction.fee} tADA</p>
            </div>
            <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-400/20">
              <p className="text-blue-300 text-xs mb-2 flex items-center space-x-1">
                <Clock className="w-3 h-3" />
                <span>Timestamp</span>
              </p>
              <p className="text-white font-semibold text-sm">{transaction.timestamp}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-400/20">
              <p className="text-blue-300 text-xs mb-2">Transaction Hash</p>
              <div className="flex items-center justify-between space-x-2">
                <p className="text-white font-mono text-sm break-all flex-1">{transaction.fullHash}</p>
                <button
                  onClick={() => handleCopy(transaction.fullHash)}
                  className="p-2 rounded-lg glass-card-hover text-blue-300 hover:text-white transition-colors flex-shrink-0"
                >
                  {copied ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-400/20">
              <p className="text-blue-300 text-xs mb-2">From</p>
              <p className="text-white font-mono text-sm break-all">{transaction.from}</p>
            </div>

            <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-400/20">
              <p className="text-blue-300 text-xs mb-2">To</p>
              <p className="text-white font-mono text-sm break-all">{transaction.to}</p>
            </div>
          </div>

          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-300"
          >
            <ExternalLink className="w-5 h-5" />
            <span>View on Cardano Explorer</span>
          </a>
        </div>
      </div>
    </div>
  );
}
