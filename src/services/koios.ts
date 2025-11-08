// Koios REST API service for Cardano transaction history
// Using env-configured endpoint
import { KOIOS_API_BASE } from '../config';

export interface KoiosTransaction {
    tx_hash: string;
    block_hash?: string;
    block_height: number;
    epoch_no: number;
    epoch_slot: number;
    absolute_slot: number;
    tx_timestamp: number; // Unix timestamp (seconds)
    tx_block_index: number;
    tx_size: number;
    total_output: string;
    fee: string;
    treasury_donation?: string;
    deposit: string;
    invalid_before?: string | null;
    invalid_after?: string | null;
    collateral_inputs?: any[];
    collateral_output?: any;
    reference_inputs?: any[];
    inputs: Array<{
        payment_addr?: {
            bech32: string;
        };
        stake_addr?: string | null;
        tx_hash: string;
        tx_index: number;
        value: string;
    }>;
    outputs: Array<{
        payment_addr?: {
            bech32: string;
            cred?: string;
        };
        stake_addr?: string | null;
        tx_hash: string;
        tx_index: number;
        value: string;
        asset_list?: Array<{
            policy_id: string;
            asset_name: string;
            quantity: string;
        }>;
        datum_hash?: string | null;
        inline_datum?: any;
        reference_script?: any;
    }>;
    withdrawals?: any[];
    assets_minted?: any[];
    metadata?: any;
    certificates?: any[];
    native_scripts?: any[];
    plutus_contracts?: any[];
    voting_procedures?: any[];
    proposal_procedures?: any[];
}

export interface ProcessedTransaction {
    id: string;
    type: 'send' | 'receive';
    amount: string;
    date: string;
    status: 'completed' | 'pending';
    hash: string;
    fullHash: string;
    from: string;
    to: string;
    fee: string;
    confirmations: number;
    timestamp: string;
    blockHeight: number;
    lovelaceAmount: number;
}

export interface TransactionStatus {
    tx_hash: string;
    num_confirmations: number;
}

/**
 * Fetch transaction status (confirmations) for given transaction hashes
 */
export async function fetchTransactionStatus(txHashes: string[]): Promise<Map<string, number>> {
    if (!txHashes || txHashes.length === 0) {
        return new Map();
    }

    try {
        const response = await fetch(`${KOIOS_API_BASE}/tx_status`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                _tx_hashes: txHashes,
            }),
        });

        if (!response.ok) {
            throw new Error(`Koios API error: ${response.statusText}`);
        }

        const statusList: TransactionStatus[] = await response.json();
        const confirmationsMap = new Map<string, number>();

        statusList.forEach((status) => {
            confirmationsMap.set(status.tx_hash, status.num_confirmations || 0);
        });

        return confirmationsMap;
    } catch (error) {
        console.error('Error fetching transaction status:', error);
        // Return empty map on error
        return new Map();
    }
}

/**
 * Fetch transaction history for a given address from Koios API
 */
export async function fetchTransactionHistory(address: string): Promise<ProcessedTransaction[]> {
    try {
        const response = await fetch(`${KOIOS_API_BASE}/address_info`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                _addresses: [address],
            }),
        });

        if (!response.ok) {
            throw new Error(`Koios API error: ${response.statusText}`);
        }

        const addressInfo = await response.json();

        if (!addressInfo || addressInfo.length === 0) {
            return [];
        }

        const txHashes = addressInfo[0]?.utxo_set?.map((utxo: any) => utxo.tx_hash) || [];

        if (txHashes.length === 0) {
            return [];
        }

        // Fetch full transaction details
        const txResponse = await fetch(`${KOIOS_API_BASE}/tx_info`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                _tx_hashes: txHashes.slice(0, 50), // Limit to 50 most recent
            }),
        });

        if (!txResponse.ok) {
            throw new Error(`Koios API error: ${txResponse.statusText}`);
        }

        const transactions: KoiosTransaction[] = await txResponse.json();

        // Process and format transactions
        const processedTxs: ProcessedTransaction[] = [];

        transactions.forEach((tx) => {
            // Determine transaction type based on inputs/outputs
            const isReceive = tx.outputs.some((output) => output.payment_addr?.bech32 === address);
            const isSend = tx.inputs.some((input) => input.payment_addr?.bech32 === address);

            if (isReceive && !isSend) {
                // Received transaction
                const output = tx.outputs.find((out) => out.payment_addr?.bech32 === address);
                if (output) {
                    const lovelaceAmount = parseInt(output.value || '0', 10);
                    const adaAmount = (lovelaceAmount / 1_000_000).toFixed(2);

                    processedTxs.push({
                        id: tx.tx_hash.slice(0, 8),
                        type: 'receive',
                        amount: `+${adaAmount}`,
                        date: new Date(tx.tx_timestamp).toISOString().split('T')[0],
                        status: 'completed',
                        hash: `${tx.tx_hash.slice(0, 8)}...`,
                        fullHash: tx.tx_hash,
                        from: tx.inputs?.[0]?.payment_addr?.bech32 || 'Unknown',
                        to: address,
                        fee: (parseInt(tx.fee || '0', 10) / 1_000_000).toFixed(2),
                        confirmations: 100, // Estimate
                        timestamp: new Date(tx.tx_timestamp).toUTCString(),
                        blockHeight: tx.block_height || 0,
                        lovelaceAmount,
                    });
                }
            } else if (isSend) {
                // Sent transaction
                const output = tx.outputs.find((out) => out.payment_addr?.bech32 !== address);
                if (output) {
                    const lovelaceAmount = parseInt(output.value || '0', 10);
                    const adaAmount = (lovelaceAmount / 1_000_000).toFixed(2);

                    processedTxs.push({
                        id: tx.tx_hash.slice(0, 8),
                        type: 'send',
                        amount: `-${adaAmount}`,
                        date: new Date(tx.tx_timestamp).toISOString().split('T')[0],
                        status: 'completed',
                        hash: `${tx.tx_hash.slice(0, 8)}...`,
                        fullHash: tx.tx_hash,
                        from: address,
                        to: output.payment_addr?.bech32 || 'Unknown',
                        fee: (parseInt(tx.fee || '0', 10) / 1_000_000).toFixed(2),
                        confirmations: 100,
                        timestamp: new Date(tx.tx_timestamp).toUTCString(),
                        blockHeight: tx.block_height || 0,
                        lovelaceAmount,
                    });
                }
            }
        });

        // Sort by date descending
        return processedTxs.sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
    } catch (error) {
        console.error('Error fetching transaction history:', error);
        throw error;
    }
}

/**
 * Alternative: Fetch transactions directly by address using tx_history endpoint
 */
export async function fetchAddressTransactions(address: string): Promise<ProcessedTransaction[]> {
    try {
        const response = await fetch(`${KOIOS_API_BASE}/address_txs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                _addresses: [address],
            }),
        });

        if (!response.ok) {
            throw new Error(`Koios API error: ${response.statusText}`);
        }

        const txList = await response.json();

        if (!txList || txList.length === 0) {
            return [];
        }

        // Get detailed transaction info
        const txHashesForInfo = txList.slice(0, 20).map((tx: any) => tx.tx_hash);

        const txResponse = await fetch(`${KOIOS_API_BASE}/tx_info`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                _tx_hashes: txHashesForInfo,
                _inputs: true,  // Request inputs to properly identify sent transactions
                _metadata: false,
                _assets: false,
                _withdrawals: false,
                _certs: false,
                _scripts: false,
                _bytecode: false,
            }),
        });

        if (!txResponse.ok) {
            throw new Error(`Koios API error: ${txResponse.statusText}`);
        }

        const transactions: KoiosTransaction[] = await txResponse.json();

        // Fetch confirmations for all transactions
        const txHashesForStatus = transactions.map((tx) => tx.tx_hash);
        const confirmationsMap = await fetchTransactionStatus(txHashesForStatus);

        const processedTxs: ProcessedTransaction[] = [];

        transactions.forEach((tx) => {
            // Get confirmations from the map, default to 0 if not found
            const confirmations = confirmationsMap.get(tx.tx_hash) || 0;
            // Check if address appears in inputs (sent from this address)
            const hasInputFromAddress = tx.inputs && tx.inputs.length > 0
                ? tx.inputs.some((input: any) => input.payment_addr?.bech32 === address)
                : false;

            // Check if address appears in outputs (received to this address)
            const outputsToAddress = tx.outputs.filter((output: any) =>
                output.payment_addr?.bech32 === address
            );

            // Check outputs to other addresses (sent to others)
            const outputsToOthers = tx.outputs.filter((output: any) =>
                output.payment_addr?.bech32 !== address
            );

            // RECEIVED: Address in outputs but NOT in inputs (pure receive)
            if (outputsToAddress.length > 0 && !hasInputFromAddress) {
                const totalReceived = outputsToAddress.reduce((sum: number, output: any) => {
                    return sum + parseInt(output.value || '0', 10);
                }, 0);

                const adaAmount = (totalReceived / 1_000_000).toFixed(2);
                const fromAddress = tx.inputs && tx.inputs.length > 0
                    ? tx.inputs[0]?.payment_addr?.bech32 || 'Unknown'
                    : 'Unknown';

                processedTxs.push({
                    id: tx.tx_hash.slice(0, 8),
                    type: 'receive',
                    amount: `+${adaAmount}`,
                    date: new Date((tx.tx_timestamp || 0) * 1000).toISOString().split('T')[0],
                    status: 'completed',
                    hash: `${tx.tx_hash.slice(0, 8)}...`,
                    fullHash: tx.tx_hash,
                    from: fromAddress,
                    to: address,
                    fee: (parseInt(tx.fee || '0', 10) / 1_000_000).toFixed(2),
                    confirmations: confirmations,
                    timestamp: new Date((tx.tx_timestamp || 0) * 1000).toUTCString(),
                    blockHeight: tx.block_height || 0,
                    lovelaceAmount: totalReceived,
                });
            }
            // SENT: Address in inputs (or if inputs empty, check if address sent by having outputs to others)
            else if (hasInputFromAddress || (tx.inputs.length === 0 && outputsToOthers.length > 0 && outputsToAddress.length === 0)) {
                // Calculate total sent (outputs to others)
                const totalSent = outputsToOthers.reduce((sum: number, output: any) => {
                    return sum + parseInt(output.value || '0', 10);
                }, 0);

                if (totalSent > 0) {
                    const adaAmount = (totalSent / 1_000_000).toFixed(2);
                    const toAddress = outputsToOthers[0]?.payment_addr?.bech32 || 'Unknown';

                    processedTxs.push({
                        id: tx.tx_hash.slice(0, 8),
                        type: 'send',
                        amount: `-${adaAmount}`,
                        date: new Date((tx.tx_timestamp || 0) * 1000).toISOString().split('T')[0],
                        status: 'completed',
                        hash: `${tx.tx_hash.slice(0, 8)}...`,
                        fullHash: tx.tx_hash,
                        from: address,
                        to: toAddress,
                        fee: (parseInt(tx.fee || '0', 10) / 1_000_000).toFixed(2),
                        confirmations: confirmations,
                        timestamp: new Date((tx.tx_timestamp || 0) * 1000).toUTCString(),
                        blockHeight: tx.block_height || 0,
                        lovelaceAmount: totalSent,
                    });
                }
            }
            // BOTH (sent and received in same tx - self transaction or exchange)
            else if (hasInputFromAddress && outputsToAddress.length > 0) {
                // Calculate net amount (received - sent to self - change back)
                const receivedAmount = outputsToAddress.reduce((sum: number, output: any) => {
                    return sum + parseInt(output.value || '0', 10);
                }, 0);

                const sentToOthers = outputsToOthers.reduce((sum: number, output: any) => {
                    return sum + parseInt(output.value || '0', 10);
                }, 0);

                // If we sent more than we received back, it's a net send
                if (sentToOthers > 0) {
                    const adaAmount = (sentToOthers / 1_000_000).toFixed(2);
                    const toAddress = outputsToOthers[0]?.payment_addr?.bech32 || 'Unknown';

                    processedTxs.push({
                        id: tx.tx_hash.slice(0, 8),
                        type: 'send',
                        amount: `-${adaAmount}`,
                        date: new Date((tx.tx_timestamp || 0) * 1000).toISOString().split('T')[0],
                        status: 'completed',
                        hash: `${tx.tx_hash.slice(0, 8)}...`,
                        fullHash: tx.tx_hash,
                        from: address,
                        to: toAddress,
                        fee: (parseInt(tx.fee || '0', 10) / 1_000_000).toFixed(2),
                        confirmations: confirmations,
                        timestamp: new Date((tx.tx_timestamp || 0) * 1000).toUTCString(),
                        blockHeight: tx.block_height || 0,
                        lovelaceAmount: sentToOthers,
                    });
                } else if (receivedAmount > 0) {
                    // Net receive
                    const adaAmount = (receivedAmount / 1_000_000).toFixed(2);
                    const fromAddress = tx.inputs && tx.inputs.length > 0
                        ? tx.inputs.find((inp: any) => inp.payment_addr?.bech32 !== address)?.payment_addr?.bech32 || tx.inputs[0]?.payment_addr?.bech32 || 'Unknown'
                        : 'Unknown';

                    processedTxs.push({
                        id: tx.tx_hash.slice(0, 8),
                        type: 'receive',
                        amount: `+${adaAmount}`,
                        date: new Date((tx.tx_timestamp || 0) * 1000).toISOString().split('T')[0],
                        status: 'completed',
                        hash: `${tx.tx_hash.slice(0, 8)}...`,
                        fullHash: tx.tx_hash,
                        from: fromAddress,
                        to: address,
                        fee: (parseInt(tx.fee || '0', 10) / 1_000_000).toFixed(2),
                        confirmations: confirmations,
                        timestamp: new Date((tx.tx_timestamp || 0) * 1000).toUTCString(),
                        blockHeight: tx.block_height || 0,
                        lovelaceAmount: receivedAmount,
                    });
                }
            }
        });

        return processedTxs.sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
    } catch (error) {
        console.error('Error fetching address transactions:', error);
        throw error;
    }
}

