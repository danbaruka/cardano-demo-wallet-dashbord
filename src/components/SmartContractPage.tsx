import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, Lock, RefreshCw, Unlock } from 'lucide-react';
import { useWallet } from '@meshsdk/react';
import { toast } from 'react-toastify';

import { CARDANOSCANNER_BASE } from '../config';
import { getOwnerLockScriptAddress, getOwnerLockScriptHash } from '../services/ownerLock';
import { lockAdaToOwnerScript, unlockAdaFromOwnerScript } from '../services/ownerLockTransactions';
import { fetchMyOwnerLockedTotalLovelace, fetchMyOwnerLockedUtxos } from '../services/ownerLockUtxos';
import { waitForTxConfirmations } from '../services/koios';

export default function SmartContractPage() {
  const { wallet, connected } = useWallet();

  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [amountAda, setAmountAda] = useState('');

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [unlocking, setUnlocking] = useState<Record<string, boolean>>({});

  const [lockedTotal, setLockedTotal] = useState<number>(0);
  const [lockedUtxos, setLockedUtxos] = useState<Array<{ tx_hash: string; tx_index: number; lovelace: number }>>(
    [],
  );

  const scriptAddress = useMemo(() => getOwnerLockScriptAddress(), []);
  const scriptHash = useMemo(() => getOwnerLockScriptHash(), []);

  const explorerAddressUrl = `${CARDANOSCANNER_BASE}/address/${scriptAddress}`;
  const explorerScriptUrl = `${CARDANOSCANNER_BASE}/script/${scriptHash}`;

  const formatAda = (lovelace: number) => (lovelace / 1_000_000).toFixed(6);

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
    if (!wallet || !connected) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, wallet]);

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
      toast.info(`Unlock submitted. Waiting for confirmation… (${txHash.slice(0, 10)}…)`);
      await waitForTxConfirmations(txHash, { minConfirmations: 1, timeoutMs: 180_000, pollIntervalMs: 5_000 });
      toast.success('Unlock confirmed on-chain.');
      await refresh();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Unlock failed');
    } finally {
      setUnlocking((m) => ({ ...m, [key]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-white font-bold text-xl md:text-2xl">Smart Contract</h2>
            <p className="text-blue-300/70 text-xs md:text-sm">
              Owner-lock validator (Aiken, Plutus V3). Lock ADA at the script; only the datum owner can unlock.
            </p>
          </div>
          <button
            onClick={() => void refresh()}
            disabled={isRefreshing}
            className="px-4 py-2 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-white text-sm font-semibold border border-blue-400/20 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-xl bg-blue-950/40 border border-blue-400/15 p-4">
            <p className="text-blue-300 text-xs mb-1">Script address</p>
            <p className="text-white/90 text-xs font-mono break-all">{scriptAddress}</p>
            <div className="mt-2">
              <a
                href={explorerAddressUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-blue-300 hover:text-white text-xs font-semibold"
              >
                View address on explorer <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div className="rounded-xl bg-blue-950/40 border border-blue-400/15 p-4">
            <p className="text-blue-300 text-xs mb-1">Script hash</p>
            <p className="text-white/90 text-xs font-mono break-all">{scriptHash}</p>
            <div className="mt-2">
              <a
                href={explorerScriptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-blue-300 hover:text-white text-xs font-semibold"
              >
                View script on explorer <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div className="rounded-xl bg-blue-950/40 border border-blue-400/15 p-4">
            <p className="text-blue-300 text-xs mb-1">Your locked total</p>
            <p className="text-white text-2xl font-bold">{formatAda(lockedTotal)} tADA</p>
            {walletAddress && (
              <p className="text-blue-300/70 text-xs font-mono break-all mt-2">
                Wallet: <span className="text-white/90">{walletAddress}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={handleLock} className="glass-card rounded-2xl p-6 md:p-8">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-5 h-5 text-cyan-300" />
            <h3 className="text-white font-bold text-lg">Lock ADA</h3>
          </div>
          <p className="text-blue-300/70 text-xs mb-4">
            Datum: constructor(0) with fields [ownerPaymentKeyHash]. Redeemer: `Data` (not used).
          </p>

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
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold transition-all disabled:opacity-50 inline-flex items-center justify-center"
            >
              {isLocking ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Lock'}
            </button>
          </div>
        </form>

        <div className="glass-card rounded-2xl p-6 md:p-8">
          <div className="flex items-center gap-2 mb-4">
            <Unlock className="w-5 h-5 text-green-300" />
            <h3 className="text-white font-bold text-lg">Your locked UTxOs</h3>
          </div>

          {lockedUtxos.length === 0 ? (
            <p className="text-blue-300 text-sm">No locked UTxOs found for this wallet.</p>
          ) : (
            <div className="space-y-2">
              {lockedUtxos.map((u) => {
                const key = `${u.tx_hash}#${u.tx_index}`;
                const isUnlocking = unlocking[key] === true;
                const explorerTxUrl = `${CARDANOSCANNER_BASE}/transaction/${u.tx_hash}`;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-blue-950/30 border border-blue-400/10"
                  >
                    <div className="min-w-0">
                      <p className="text-white font-semibold">{formatAda(u.lovelace)} tADA</p>
                      <a
                        href={explorerTxUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-300 hover:text-white text-xs font-mono inline-flex items-center gap-2"
                        title="View transaction on explorer"
                      >
                        {u.tx_hash.slice(0, 16)}…#{u.tx_index} <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <button
                      onClick={() => void handleUnlock(u.tx_hash, u.tx_index)}
                      disabled={isUnlocking}
                      className="px-4 py-2 rounded-xl bg-green-500/20 hover:bg-green-500/30 text-white text-sm font-semibold border border-green-500/20 disabled:opacity-50 inline-flex items-center justify-center"
                    >
                      {isUnlocking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Unlock'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-blue-400/60 text-xs mt-4">
            Unlock requires collateral set in your wallet (Plutus spend).
          </p>
        </div>
      </div>
    </div>
  );
}

