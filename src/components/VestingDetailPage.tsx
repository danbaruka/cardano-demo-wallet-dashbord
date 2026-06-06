import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Clock,
  ExternalLink,
  Loader2,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { useWallet } from '@meshsdk/react';
import { toast } from 'react-toastify';

import { CARDANOSCANNER_BASE } from '../config';
import { waitForTxConfirmations } from '../services/koios';
import { getVestingScriptAddress, getVestingScriptHash } from '../services/vesting';
import { fetchVestingHistory } from '../services/vestingHistory';
import {
  buildTrancheTimeline,
  claimableLovelace,
} from '../services/vestingMath';
import { formatDurationMs } from '../types/vesting';
import { claimVestedAda, cancelVesting } from '../services/vestingTransactions';
import {
  computeVestingBalances,
  isWalletBeneficiary,
  isWalletIssuer,
} from '../services/vestingUtxos';
import type { VestingTxEvent, VestingUtxo } from '../types/vesting';

interface VestingDetailPageProps {
  utxo: VestingUtxo;
  walletAddresses: string[];
  onBack: () => void;
  onRefresh: () => Promise<void>;
}

export default function VestingDetailPage({
  utxo,
  walletAddresses,
  onBack,
  onRefresh,
}: VestingDetailPageProps) {
  const { wallet, connected } = useWallet();
  const [claimAmountAda, setClaimAmountAda] = useState('');
  const [history, setHistory] = useState<VestingTxEvent[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [acting, setActing] = useState<'claim' | 'cancel' | null>(null);

  const scriptAddress = useMemo(() => getVestingScriptAddress(), []);
  const scriptHash = useMemo(() => getVestingScriptHash(), []);
  const balances = useMemo(() => computeVestingBalances(utxo), [utxo]);
  const claimable = useMemo(() => claimableLovelace(utxo), [utxo]);
  const timeline = useMemo(
    () =>
      buildTrancheTimeline(
        utxo.startTime,
        utxo.totalAmount,
        utxo.vestingPeriodMs,
        utxo.releaseIntervalMs,
        utxo.claimedAmount,
      ),
    [utxo],
  );

  const formatAda = (lovelace: number) => (lovelace / 1_000_000).toFixed(6);
  const canClaim = isWalletBeneficiary(utxo, walletAddresses) && claimable > 0;
  const canCancel = isWalletIssuer(utxo, walletAddresses);

  useEffect(() => {
    setClaimAmountAda((claimable / 1_000_000).toFixed(6));
  }, [claimable]);

  useEffect(() => {
    const load = async () => {
      setLoadingHistory(true);
      try {
        const events = await fetchVestingHistory(
          scriptAddress,
          utxo.vestingId,
          utxo.issuerVkh,
          utxo.beneficiaryVkh,
        );
        setHistory(events);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingHistory(false);
      }
    };
    void load();
  }, [scriptAddress, utxo]);

  const runClaim = async (amountLovelace: number) => {
    if (!wallet || !connected) {
      toast.error('Wallet not connected');
      return;
    }
    setActing('claim');
    try {
      const txHash = await claimVestedAda(wallet, {
        utxo: { tx_hash: utxo.tx_hash, tx_index: utxo.tx_index },
        amountLovelace,
      });
      toast.info(`Claim submitted (${txHash.slice(0, 10)}…)`);
      await waitForTxConfirmations(txHash, { minConfirmations: 1, timeoutMs: 180_000, pollIntervalMs: 5_000 });
      toast.success('Claim confirmed.');
      await onRefresh();
      onBack();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Claim failed');
    } finally {
      setActing(null);
    }
  };

  const runCancel = async () => {
    if (!wallet || !connected) {
      toast.error('Wallet not connected');
      return;
    }
    setActing('cancel');
    try {
      const txHash = await cancelVesting(wallet, {
        tx_hash: utxo.tx_hash,
        tx_index: utxo.tx_index,
      });
      toast.info(`Cancel submitted (${txHash.slice(0, 10)}…)`);
      await waitForTxConfirmations(txHash, { minConfirmations: 1, timeoutMs: 180_000, pollIntervalMs: 5_000 });
      toast.success('Vesting cancelled.');
      await onRefresh();
      onBack();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Cancel failed');
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-blue-300 hover:text-white text-sm font-semibold"
      >
        <ArrowLeft className="w-4 h-4" /> Back to vesting list
      </button>

      <div className="glass-card rounded-2xl p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-white font-bold text-xl md:text-2xl">Vesting details</h2>
            <p className="text-blue-300/70 text-xs font-mono break-all mt-1">ID: {utxo.vestingId}</p>
            <p className="text-blue-300/70 text-xs font-mono break-all">UTxO: {utxo.tx_hash}#{utxo.tx_index}</p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold border ${
              balances.status === 'active'
                ? 'bg-cyan-500/20 border-cyan-400/30 text-cyan-200'
                : balances.status === 'completed'
                  ? 'bg-green-500/20 border-green-400/30 text-green-200'
                  : 'bg-red-500/20 border-red-400/30 text-red-200'
            }`}
          >
            {balances.status}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            ['Total', formatAda(balances.total)],
            ['Claimed', formatAda(balances.claimed)],
            ['Claimable now', formatAda(balances.claimableNow)],
            ['Remaining', formatAda(balances.remaining)],
            ['In UTxO', formatAda(balances.lockedInUtxo)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-blue-950/40 border border-blue-400/15 p-3">
              <p className="text-blue-300 text-xs">{label}</p>
              <p className="text-white font-bold">{value} tADA</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl bg-blue-950/30 border border-blue-400/10 p-3">
            <p className="text-blue-300 mb-1">Schedule</p>
            <p className="text-white/90">
              Period: {formatDurationMs(utxo.vestingPeriodMs)} · Interval:{' '}
              {formatDurationMs(utxo.releaseIntervalMs)}
            </p>
            <p className="text-white/90 mt-1">
              Start: {new Date(utxo.startTime).toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl bg-blue-950/30 border border-blue-400/10 p-3">
            <p className="text-blue-300 mb-1">Script</p>
            <p className="text-white/90 font-mono break-all">{scriptAddress}</p>
            <div className="mt-2 flex gap-3">
              <a
                href={`${CARDANOSCANNER_BASE}/address/${scriptAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-300 hover:text-white inline-flex items-center gap-1"
              >
                Address <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href={`${CARDANOSCANNER_BASE}/script/${scriptHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-300 hover:text-white inline-flex items-center gap-1"
              >
                Script <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-6 md:p-8">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-cyan-300" />
          <h3 className="text-white font-bold text-lg">Release timeline</h3>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {timeline.map((t) => (
            <div
              key={t.index}
              className={`flex items-center justify-between p-3 rounded-xl border text-sm ${
                t.state === 'past'
                  ? 'bg-green-950/30 border-green-500/20'
                  : t.state === 'current'
                    ? 'bg-cyan-950/30 border-cyan-400/30'
                    : 'bg-blue-950/20 border-blue-400/10'
              }`}
            >
              <div>
                <p className="text-white font-semibold">Tranche #{t.index}</p>
                <p className="text-blue-300 text-xs">{new Date(t.unlockAt).toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-white">{formatAda(t.amountLovelace)} tADA</p>
                <p className="text-blue-300 text-xs capitalize">{t.state}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {(canClaim || canCancel) && (
        <div className="glass-card rounded-2xl p-6 md:p-8">
          <h3 className="text-white font-bold text-lg mb-4">Actions</h3>
          {canClaim && (
            <div className="space-y-3 mb-4">
              <div className="flex gap-3">
                <input
                  type="number"
                  step="0.000001"
                  value={claimAmountAda}
                  onChange={(e) => setClaimAmountAda(e.target.value)}
                  className="flex-1 bg-blue-950/60 border-2 border-blue-400/20 rounded-xl px-4 py-3 text-white"
                  disabled={acting !== null}
                />
                <button
                  onClick={() => void runClaim(Math.floor(Number(claimAmountAda) * 1_000_000))}
                  disabled={acting !== null}
                  className="px-5 py-3 rounded-xl bg-green-500/20 hover:bg-green-500/30 text-white font-semibold border border-green-500/20 disabled:opacity-50"
                >
                  {acting === 'claim' ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Claim'}
                </button>
              </div>
              <button
                onClick={() => void runClaim(claimable)}
                disabled={acting !== null || claimable <= 0}
                className="text-sm text-cyan-300 hover:text-white font-semibold"
              >
                Claim max ({formatAda(claimable)} tADA)
              </button>
            </div>
          )}
          {canCancel && (
            <button
              onClick={() => void runCancel()}
              disabled={acting !== null}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-white font-semibold border border-red-500/20 disabled:opacity-50"
            >
              {acting === 'cancel' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <XCircle className="w-5 h-5" />
              )}
              Cancel vesting (issuer)
            </button>
          )}
        </div>
      )}

      <div className="glass-card rounded-2xl p-6 md:p-8">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-blue-300" />
          <h3 className="text-white font-bold text-lg">Transaction history</h3>
        </div>
        {loadingHistory ? (
          <div className="flex items-center gap-2 text-blue-300 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading history…
          </div>
        ) : history.length === 0 ? (
          <p className="text-blue-300 text-sm">No related transactions found yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-blue-300 text-left border-b border-blue-400/10">
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2">Tx</th>
                </tr>
              </thead>
              <tbody>
                {history.map((event) => (
                  <tr key={event.txHash} className="border-b border-blue-400/5">
                    <td className="py-3 pr-3 capitalize text-white">{event.type}</td>
                    <td className="py-3 pr-3 text-white">{formatAda(event.amountLovelace)} tADA</td>
                    <td className="py-3 pr-3 text-blue-200 capitalize">{event.role}</td>
                    <td className="py-3 pr-3 text-blue-300">{new Date(event.timestamp).toLocaleString()}</td>
                    <td className="py-3">
                      <a
                        href={`${CARDANOSCANNER_BASE}/transaction/${event.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-300 hover:text-white inline-flex items-center gap-1 font-mono"
                      >
                        {event.txHash.slice(0, 10)}… <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
