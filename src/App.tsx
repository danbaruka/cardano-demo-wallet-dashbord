import { useState, useEffect } from 'react';
import { useWallet } from '@meshsdk/react';
import ConnectWallet from './components/ConnectWallet';
import Dashboard from './components/Dashboard';
import { toast } from 'react-toastify';
import { ADDRESS_PREFIX, CARDANO_NETWORK } from './config';

function App() {
  const { connected, wallet, connect, disconnect, name } = useWallet();
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  // Validate address by network prefix
  const validateNetworkAddress = (address: string): boolean => {
    return address.startsWith(ADDRESS_PREFIX);
  };

  const handleDisconnect = () => {
    setWalletAddress(null);
    setIsConnected(false);
    localStorage.removeItem('walletAddress');
    localStorage.removeItem('walletConnected');
    localStorage.removeItem('walletName');
  };

  // Restore session from localStorage and reconnect wallet
  useEffect(() => {
    const restoreSession = async () => {
      const savedWalletName = localStorage.getItem('walletName');
      const savedAddress = localStorage.getItem('walletAddress');
      const savedConnection = localStorage.getItem('walletConnected') === 'true';
      
      if (savedConnection && savedWalletName && savedAddress) {
        try {
          // Validate saved address is still correct network
          if (!validateNetworkAddress(savedAddress)) {
            localStorage.removeItem('walletAddress');
            localStorage.removeItem('walletConnected');
            localStorage.removeItem('walletName');
            setIsRestoring(false);
            return;
          }

          // Attempt to reconnect to the saved wallet
          await connect(savedWalletName);
          // Note: We'll verify the connection in the next useEffect when wallet becomes available
        } catch (error: any) {
          console.error('Error restoring wallet connection:', error);
          // Clear invalid session if wallet connection fails
          handleDisconnect();
          setIsRestoring(false);
        }
      } else {
        setIsRestoring(false);
      }
    };

    restoreSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  // Verify restored connection when wallet becomes available
  useEffect(() => {
    if (!isRestoring) return; // Only during restoration
    
    const verifyRestoredConnection = async () => {
      if (connected && wallet) {
        try {
          const addresses = await wallet.getUsedAddresses();
          const currentAddress = addresses[0];
          
          if (currentAddress && validateNetworkAddress(currentAddress)) {
            setWalletAddress(currentAddress);
            setIsConnected(true);
            
            // Update saved address if it changed
            const savedAddress = localStorage.getItem('walletAddress');
            if (currentAddress !== savedAddress) {
              localStorage.setItem('walletAddress', currentAddress);
            }
          } else {
            // Address validation failed
            await disconnect();
            handleDisconnect();
            toast.error(`Wallet network mismatch. Please switch to ${CARDANO_NETWORK} network.`);
          }
        } catch (error) {
          console.error('Error verifying restored wallet address:', error);
          handleDisconnect();
        } finally {
          setIsRestoring(false);
        }
      } else if (!connected && !isRestoring) {
        // If we were restoring but wallet didn't connect, clear session after a timeout
        setTimeout(() => {
          if (!connected) {
            handleDisconnect();
            setIsRestoring(false);
          }
        }, 3000);
      }
    };

    verifyRestoredConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, wallet, isRestoring]);

  // Sync with MeshJS wallet state after initial restoration
  useEffect(() => {
    if (isRestoring) return; // Don't sync during restoration

    if (connected && wallet && !isConnected) {
      // Wallet connected - verify network and update state
      const verifyConnection = async () => {
        try {
          const addresses = await wallet.getUsedAddresses();
          const address = addresses[0];
          
          if (address && validateNetworkAddress(address)) {
            setWalletAddress(address);
            setIsConnected(true);
            localStorage.setItem('walletAddress', address);
            localStorage.setItem('walletConnected', 'true');
            if (name) {
              localStorage.setItem('walletName', name);
            }
          } else {
            // Wrong network
            await disconnect();
            toast.error(`Only ${CARDANO_NETWORK} network is supported. Please switch your wallet to ${CARDANO_NETWORK}.`);
          }
        } catch (error) {
          console.error('Error verifying connection:', error);
        }
      };
      verifyConnection();
    } else if (!connected && isConnected && !isRestoring) {
      // Wallet disconnected externally
      handleDisconnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, wallet, disconnect, isRestoring]);

  const handleConnect = async (walletName: string, address: string) => {
    setWalletAddress(address);
    setIsConnected(true);
    localStorage.setItem('walletAddress', address);
    localStorage.setItem('walletConnected', 'true');
    localStorage.setItem('walletName', walletName);
  };

  // Determine what to show based on restoration state
  const showDashboard = isRestoring 
    ? localStorage.getItem('walletConnected') === 'true' // Show dashboard skeleton if restoring and had connection
    : isConnected;

  return (
    <>
      {!showDashboard ? (
        <ConnectWallet onConnect={handleConnect} />
      ) : (
        <Dashboard 
          onDisconnect={handleDisconnect} 
          walletAddress={walletAddress || localStorage.getItem('walletAddress') || ''}
          isRestoring={isRestoring}
        />
      )}
    </>
  );
}

export default App;
