import { useEffect, useMemo, useState } from 'react';
import { X, Lock, Unlock, Loader2 } from 'lucide-react';
import { useWallet } from '@meshsdk/react';
import { toast } from 'react-toastify';

import { lockAdaToOwnerScript, unlockAdaFromOwnerScript } from '../services/ownerLockTransactions';
import { fetchMyOwnerLockedTotalLovelace, fetchMyOwnerLockedUtxos } from '../services/ownerLockUtxos';
import { getOwnerLockScriptAddress } from '../services/ownerLock';

interface OwnerLockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function OwnerLockModal({ isOpen, onClose, onSuccess }: OwnerLockModalProps) {
  const { wallet, connected } = useWallet();

  const [amountAda, setAmountAda] = useState('');
  const [isLocking, setIsLocking] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [unlocking, setUnlocking] = useState<Record<string, boolean>>({});

  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [lockedTotal, setLockedTotal] = useState<number>(0);
  const [lockedUtxos, setLockedUtxos] = useState<Array<{ tx_hash: string; tx_index: number; lovelace: number }>>(
    [],
  );

  const scriptAddress = useMemo(() => getOwnerLockScriptAddress(), []);

  const refresh = async () => {
    if (!wallet || !connected) return;
    setIsRefreshing(true);
    try {
      const addr = (await wallet.getUsedAddresses())[0] ?? (await wallet.getChangeAddress());
      setWalletAddress(addr);

      const [utxos, total] = await Promise.all([
        fetchMyOwnerLockedUtxos(addr),
        fetchMyOwnerLockedTotalLovelace(addr),
      ]);

      setLockedUtxos(
        utxos.map((u) => ({
          tx_hash: u.tx_hash,
          tx_index: u.tx_index,
          lovelace: u.lovelace,
        })),
      );
      setLockedTotal(total);
    } catch (e) {
      console.error(e);
      toast.error('Failed to fetch locked UTxOs from Koios');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (!wallet || !connected) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, connected, wallet]);

  if (!isOpen) return null;

  const formatAda = (lovelace: number) => (lovelace / 1_000_000).toFixed(6);

  const handleLock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet || !connected) {
      toast.error('Wallet not connected');
      return;
    }

    const amountNum = Number(amountAda);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error('Enter a valid ADA amount');
      return;
    }

    const lovelace = Math.floor(amountNum * 1_000_000);
    if (lovelace < 2_000_000) {
      toast.error('Minimum lock is 2 ADA (min-UTxO)');
      return;
    }

    setIsLocking(true);
    try {
      const txHash = await lockAdaToOwnerScript(wallet, lovelace.toString());
      toast.success(`Locked funds. Tx: ${txHash.slice(0, 10)}…`);
      setAmountAda('');
      await refresh();
      onSuccess?.();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Lock failed');
    } finally {
      setIsLocking(false);
    }
  };

  const handleUnlock = async (tx_hash: string, tx_index: number) => {
    if (!wallet || !connected) {
      toast.error('Wallet not connected');
      return;
    }

    const key = `${tx_hash}#${tx_index}`;
    setUnlocking((m) => ({ ...m, [key]: true }));
    try {
      const txHash = await unlockAdaFromOwnerScript(wallet, { tx_hash, tx_index });
      toast.success(`Unlocked funds. Tx: ${txHash.slice(0, 10)}…`);
      await refresh();
      onSuccess?.();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Unlock failed');
    } finally {
      setUnlocking((m) => ({ ...m, [key]: false }));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl glass-card rounded-2xl border border-blue-400/20 shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-blue-400/10">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
              <Lock className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">Script Vault (Owner Lock)</h2>
              <p className="text-blue-300/70 text-xs">Lock ADA at a script; only you can unlock</p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 rounded-xl glass-card-hover text-blue-300 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="rounded-xl bg-blue-950/40 border border-blue-400/15 p-4">
            <p className="text-blue-300 text-xs font-mono break-all">
              Script address: <span className="text-white/90">{scriptAddress}</span>
            </p>
            {walletAddress && (
              <p className="text-blue-300 text-xs font-mono break-all mt-2">
                Your address: <span className="text-white/90">{walletAddress}</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl bg-blue-950/40 border border-blue-400/15 p-4">
              <p className="text-blue-300 text-xs mb-1">Your locked total</p>
              <p className="text-white text-2xl font-bold">{formatAda(lockedTotal)} tADA</p>
            </div>
            <div className="rounded-xl bg-blue-950/40 border border-blue-400/15 p-4 flex items-center justify-between">
              <div>
                <p className="text-blue-300 text-xs mb-1">Refresh</p>
                <p className="text-blue-400/70 text-xs">Koios script UTxOs</p>
              </div>
              <button
                onClick={() => void refresh()}
                disabled={isRefreshing}
                className="px-4 py-2 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-white text-sm font-semibold border border-blue-400/20 disabled:opacity-50"
              >
                {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
              </button>
            </div>
          </div>

          <form onSubmit={handleLock} className="rounded-xl bg-blue-950/40 border border-blue-400/15 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Lock className="w-4 h-4 text-cyan-300" />
                <p className="text-white font-semibold">Lock ADA</p>
              </div>
              <p className="text-blue-300/70 text-xs">Inline datum = your payment key hash</p>
            </div>

            <div className="flex gap-3">
              <input
                type="number"
                step="0.000001"
                placeholder="2.000000"
                value={amountAda}
                onChange={(e) => setAmountAda(e.target.value)}
                className="flex-1 bg-blue-950/60 border-2 border-blue-400/20 rounded-xl px-4 py-3 text-white placeholder-blue-400/40 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition-all"
                disabled={isLocking}
              />
              <button
                type="submit"
                disabled={isLocking}
                className="px-5 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold transition-all disabled:opacity-50"
              >
                {isLocking ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Lock'}
              </button>
            </div>
          </form>

          <div className="rounded-xl bg-blue-950/40 border border-blue-400/15 p-4">
            <div className="flex items-center space-x-2 mb-3">
              <Unlock className="w-4 h-4 text-green-300" />
              <p className="text-white font-semibold">Your locked UTxOs</p>
            </div>

            {lockedUtxos.length === 0 ? (
              <p className="text-blue-300 text-sm">No locked UTxOs found for this wallet.</p>
            ) : (
              <div className="space-y-2">
                {lockedUtxos.map((u) => {
                  const key = `${u.tx_hash}#${u.tx_index}`;
                  const isUnlocking = unlocking[key] === true;
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl bg-blue-950/30 border border-blue-400/10"
                    >
                      <div className="min-w-0">
                        <p className="text-white font-semibold">{formatAda(u.lovelace)} tADA</p>
                        <p className="text-blue-300 text-xs font-mono truncate">
                          {u.tx_hash.slice(0, 16)}…#{u.tx_index}
                        </p>
                      </div>
                      <button
                        onClick={() => void handleUnlock(u.tx_hash, u.tx_index)}
                        disabled={isUnlocking}
                        className="px-4 py-2 rounded-xl bg-green-500/20 hover:bg-green-500/30 text-white text-sm font-semibold border border-green-500/20 disabled:opacity-50"
                      >
                        {isUnlocking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Unlock'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

