import { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  ExternalLink,
  Loader2,
  PlusCircle,
  RefreshCw,
} from 'lucide-react';
import { useWallet } from '@meshsdk/react';
import { toast } from 'react-toastify';

import { ADDRESS_PREFIX, CARDANOSCANNER_BASE } from '../config';
import { waitForTxConfirmations } from '../services/koios';
import { getVestingScriptAddress, getVestingScriptHash } from '../services/vesting';
import {
  claimableLovelace,
  validateSchedule,
} from '../services/vestingMath';
import { claimVestedAda, cancelVesting, createVestingLock } from '../services/vestingTransactions';
import {
  computeVestingBalances,
  fetchBeneficiaryVestingUtxos,
  fetchIssuerVestingUtxos,
  fetchWalletAddresses,
} from '../services/vestingUtxos';
import type { TimeUnit, VestingUtxo } from '../types/vesting';
import { formatDurationMs, toMilliseconds } from '../types/vesting';
import VestingDetailPage from './VestingDetailPage';

export default function VestingPage() {
  const { wallet, connected } = useWallet();

  const [walletAddresses, setWalletAddresses] = useState<string[]>([]);
  const [issuerUtxos, setIssuerUtxos] = useState<VestingUtxo[]>([]);
  const [beneficiaryUtxos, setBeneficiaryUtxos] = useState<VestingUtxo[]>([]);
  const [selected, setSelected] = useState<VestingUtxo | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [actingKey, setActingKey] = useState<string | null>(null);

  const [beneficiaryAddress, setBeneficiaryAddress] = useState('');
  const [totalAda, setTotalAda] = useState('');
  const [periodValue, setPeriodValue] = useState('10');
  const [periodUnit, setPeriodUnit] = useState<TimeUnit>('days');
  const [intervalValue, setIntervalValue] = useState('1');
  const [intervalUnit, setIntervalUnit] = useState<TimeUnit>('days');

  const scriptAddress = useMemo(() => getVestingScriptAddress(), []);
  const scriptHash = useMemo(() => getVestingScriptHash(), []);

  const preview = useMemo(() => {
    const totalLovelace = Math.floor(Number(totalAda) * 1_000_000);
    const vestingPeriodMs = toMilliseconds(Number(periodValue), periodUnit);
    const releaseIntervalMs = toMilliseconds(Number(intervalValue), intervalUnit);
    return validateSchedule({ totalLovelace, vestingPeriodMs, releaseIntervalMs });
  }, [totalAda, periodValue, periodUnit, intervalValue, intervalUnit]);

  const formatAda = (lovelace: number) => (lovelace / 1_000_000).toFixed(6);

  const refresh = async () => {
    if (!wallet || !connected) return;
    setIsRefreshing(true);
    try {
      const addresses = await fetchWalletAddresses(wallet);
      setWalletAddresses(addresses);
      const [issuer, beneficiary] = await Promise.all([
        fetchIssuerVestingUtxos(addresses),
        fetchBeneficiaryVestingUtxos(addresses),
      ]);
      setIssuerUtxos(issuer);
      setBeneficiaryUtxos(beneficiary);
      if (selected) {
        const updated =
          [...issuer, ...beneficiary].find(
            (u) => u.tx_hash === selected.tx_hash && u.tx_index === selected.tx_index,
          ) ?? null;
        setSelected(updated);
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to load vesting schedules');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!wallet || !connected) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, wallet]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet || !connected) {
      toast.error('Wallet not connected');
      return;
    }

    const totalNum = Number(totalAda);
    if (!Number.isFinite(totalNum) || totalNum <= 0) {
      toast.error('Enter a valid total ADA amount');
      return;
    }

    if (!beneficiaryAddress.startsWith(ADDRESS_PREFIX)) {
      toast.error(`Beneficiary address must start with ${ADDRESS_PREFIX}`);
      return;
    }

    const totalLovelace = Math.floor(totalNum * 1_000_000);
    const vestingPeriodMs = toMilliseconds(Number(periodValue), periodUnit);
    const releaseIntervalMs = toMilliseconds(Number(intervalValue), intervalUnit);
    const schedule = validateSchedule({ totalLovelace, vestingPeriodMs, releaseIntervalMs });

    if (!schedule.isValid) {
      toast.error(schedule.validationError || 'Invalid vesting schedule');
      return;
    }

    setIsCreating(true);
    try {
      const txHash = await createVestingLock(wallet, {
        beneficiaryAddress,
        totalLovelace,
        vestingPeriodMs,
        releaseIntervalMs,
      });
      toast.info(`Vesting lock submitted (${txHash.slice(0, 10)}…)`);
      await waitForTxConfirmations(txHash, { minConfirmations: 1, timeoutMs: 180_000, pollIntervalMs: 5_000 });
      toast.success('Vesting created on-chain.');
      setBeneficiaryAddress('');
      setTotalAda('');
      await refresh();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Failed to create vesting');
    } finally {
      setIsCreating(false);
    }
  };

  const handleQuickClaim = async (utxo: VestingUtxo) => {
    if (!wallet || !connected) return;
    const key = `claim-${utxo.tx_hash}#${utxo.tx_index}`;
    const amount = claimableLovelace(utxo);
    if (amount <= 0) {
      toast.info('Nothing claimable yet for this vesting.');
      return;
    }
    setActingKey(key);
    try {
      const txHash = await claimVestedAda(wallet, {
        utxo: { tx_hash: utxo.tx_hash, tx_index: utxo.tx_index },
        amountLovelace: amount,
      });
      toast.info(`Claim submitted (${txHash.slice(0, 10)}…)`);
      await waitForTxConfirmations(txHash, { minConfirmations: 1, timeoutMs: 180_000, pollIntervalMs: 5_000 });
      toast.success('Claim confirmed.');
      await refresh();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Claim failed');
    } finally {
      setActingKey(null);
    }
  };

  const handleQuickCancel = async (utxo: VestingUtxo) => {
    if (!wallet || !connected) return;
    const key = `cancel-${utxo.tx_hash}#${utxo.tx_index}`;
    setActingKey(key);
    try {
      const txHash = await cancelVesting(wallet, {
        tx_hash: utxo.tx_hash,
        tx_index: utxo.tx_index,
      });
      toast.info(`Cancel submitted (${txHash.slice(0, 10)}…)`);
      await waitForTxConfirmations(txHash, { minConfirmations: 1, timeoutMs: 180_000, pollIntervalMs: 5_000 });
      toast.success('Vesting cancelled.');
      await refresh();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Cancel failed');
    } finally {
      setActingKey(null);
    }
  };

  const renderCard = (utxo: VestingUtxo, role: 'issuer' | 'beneficiary') => {
    const balances = computeVestingBalances(utxo);
    const claimable = claimableLovelace(utxo);
    const key = `${utxo.tx_hash}#${utxo.tx_index}`;
    const isActing = actingKey?.includes(key) ?? false;

    return (
      <div
        key={key}
        className="p-4 rounded-xl bg-blue-950/30 border border-blue-400/10 hover:border-cyan-400/30 transition-all"
      >
        <button onClick={() => setSelected(utxo)} className="w-full text-left">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-white font-semibold">{formatAda(utxo.totalAmount)} tADA vesting</p>
              <p className="text-blue-300 text-xs mt-1">
                Claimed {formatAda(balances.claimed)} · Remaining {formatAda(balances.remaining)}
              </p>
              <p className="text-blue-300/70 text-xs font-mono mt-1">
                {utxo.tx_hash.slice(0, 14)}…#{utxo.tx_index}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs uppercase text-blue-300">{role}</span>
              {role === 'beneficiary' && (
                <p className={`text-sm font-semibold mt-1 ${claimable > 0 ? 'text-green-300' : 'text-blue-400/60'}`}>
                  {claimable > 0 ? `+${formatAda(claimable)} claimable` : 'Not yet claimable'}
                </p>
              )}
            </div>
          </div>
        </button>

        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setSelected(utxo)}
            className="px-3 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-white text-xs font-semibold border border-blue-400/20"
          >
            Details
          </button>
          {role === 'beneficiary' && (
            <button
              onClick={() => void handleQuickClaim(utxo)}
              disabled={isActing || claimable <= 0}
              className="px-3 py-1.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-white text-xs font-semibold border border-green-500/20 disabled:opacity-50 inline-flex items-center gap-1"
            >
              {isActing ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Claim max
            </button>
          )}
          {role === 'issuer' && balances.status === 'active' && (
            <button
              onClick={() => void handleQuickCancel(utxo)}
              disabled={isActing}
              className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-white text-xs font-semibold border border-red-500/20 disabled:opacity-50 inline-flex items-center gap-1"
            >
              {isActing ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  };

  if (selected && walletAddresses.length > 0) {
    return (
      <VestingDetailPage
        utxo={selected}
        walletAddresses={walletAddresses}
        onBack={() => setSelected(null)}
        onRefresh={refresh}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-white font-bold text-xl md:text-2xl">Vesting Distribution</h2>
            <p className="text-blue-300/70 text-xs md:text-sm">
              Step-release vesting (Aiken, Plutus V3). Lock ADA for a beneficiary with periodic claims.
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

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl bg-blue-950/40 border border-blue-400/15 p-4">
            <p className="text-blue-300 text-xs mb-1">Script address</p>
            <p className="text-white/90 text-xs font-mono break-all">{scriptAddress}</p>
            <a
              href={`${CARDANOSCANNER_BASE}/address/${scriptAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-2 text-blue-300 hover:text-white text-xs font-semibold"
            >
              View on explorer <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
          <div className="rounded-xl bg-blue-950/40 border border-blue-400/15 p-4">
            <p className="text-blue-300 text-xs mb-1">Script hash</p>
            <p className="text-white/90 text-xs font-mono break-all">{scriptHash}</p>
            <a
              href={`${CARDANOSCANNER_BASE}/script/${scriptHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-2 text-blue-300 hover:text-white text-xs font-semibold"
            >
              View script <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      <form onSubmit={handleCreate} className="glass-card rounded-2xl p-6 md:p-8 space-y-4">
        <div className="flex items-center gap-2">
          <PlusCircle className="w-5 h-5 text-cyan-300" />
          <h3 className="text-white font-bold text-lg">Create vesting (issuer)</h3>
        </div>

        <div>
          <label className="text-blue-300 text-xs mb-1 block">Beneficiary address</label>
          <input
            value={beneficiaryAddress}
            onChange={(e) => setBeneficiaryAddress(e.target.value)}
            placeholder={`${ADDRESS_PREFIX}…`}
            className="w-full bg-blue-950/60 border-2 border-blue-400/20 rounded-xl px-4 py-3 text-white font-mono text-sm"
            disabled={isCreating}
          />
        </div>

        <div>
          <label className="text-blue-300 text-xs mb-1 block">Total amount (ADA)</label>
          <input
            type="number"
            step="0.000001"
            value={totalAda}
            onChange={(e) => setTotalAda(e.target.value)}
            className="w-full bg-blue-950/60 border-2 border-blue-400/20 rounded-xl px-4 py-3 text-white"
            disabled={isCreating}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-blue-300 text-xs mb-1 block">Vesting period</label>
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                value={periodValue}
                onChange={(e) => setPeriodValue(e.target.value)}
                className="flex-1 bg-blue-950/60 border-2 border-blue-400/20 rounded-xl px-4 py-3 text-white"
                disabled={isCreating}
              />
              <select
                value={periodUnit}
                onChange={(e) => setPeriodUnit(e.target.value as TimeUnit)}
                className="bg-blue-950/60 border-2 border-blue-400/20 rounded-xl px-3 text-white"
                disabled={isCreating}
              >
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-blue-300 text-xs mb-1 block">Release interval (clift)</label>
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                value={intervalValue}
                onChange={(e) => setIntervalValue(e.target.value)}
                className="flex-1 bg-blue-950/60 border-2 border-blue-400/20 rounded-xl px-4 py-3 text-white"
                disabled={isCreating}
              />
              <select
                value={intervalUnit}
                onChange={(e) => setIntervalUnit(e.target.value as TimeUnit)}
                className="bg-blue-950/60 border-2 border-blue-400/20 rounded-xl px-3 text-white"
                disabled={isCreating}
              >
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-blue-950/30 border border-blue-400/10 p-4 text-sm">
          {preview.isValid ? (
            <p className="text-cyan-200">
              {preview.numTranches} tranches · {formatAda(preview.trancheLovelace)} tADA per release · period{' '}
              {formatDurationMs(toMilliseconds(Number(periodValue), periodUnit))} · interval{' '}
              {formatDurationMs(toMilliseconds(Number(intervalValue), intervalUnit))}
            </p>
          ) : (
            <p className="text-red-300">{preview.validationError}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isCreating || !preview.isValid}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold disabled:opacity-50 inline-flex items-center gap-2"
        >
          {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Clock className="w-5 h-5" />}
          Lock vesting
        </button>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card rounded-2xl p-6 md:p-8">
          <h3 className="text-white font-bold text-lg mb-4">As issuer</h3>
          {issuerUtxos.length === 0 ? (
            <p className="text-blue-300 text-sm">No active vestings created by this wallet.</p>
          ) : (
            <div className="space-y-2">{issuerUtxos.map((u) => renderCard(u, 'issuer'))}</div>
          )}
        </div>

        <div className="glass-card rounded-2xl p-6 md:p-8">
          <h3 className="text-white font-bold text-lg mb-4">As beneficiary</h3>
          {beneficiaryUtxos.length === 0 ? (
            <p className="text-blue-300 text-sm">No vestings assigned to this wallet.</p>
          ) : (
            <div className="space-y-2">{beneficiaryUtxos.map((u) => renderCard(u, 'beneficiary'))}</div>
          )}
        </div>
      </div>
    </div>
  );
}
