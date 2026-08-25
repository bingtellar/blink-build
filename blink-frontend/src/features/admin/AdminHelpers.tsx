import { rpc, Contract, Address, Account, TransactionBuilder, Networks, scValToNative } from '@stellar/stellar-sdk';

export const StatusBadge = ({ status }: { status: string }) => {
  const s = status?.toLowerCase() || "";
  if (s.includes("completed") || s.includes("paid") || s === "successful" || s === "active") return <span className="text-[#10B981] flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#10B981]"></span>{s === "active" ? "Active" : "Completed"}</span>;
  if (s.includes("pending") || s.includes("processing") || s.includes("started")) return <span className="text-[#F59E0B] flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]"></span>Pending</span>;
  if (s.includes("failed") || s.includes("cancelled") || s.includes("expired") || s.includes("frozen")) return <span className="text-[#EF4444] flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]"></span>{s === "frozen" ? "Frozen" : "Failed"}</span>;
  return <span className="text-gray-500 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>{status}</span>;
};

export const timeAgo = (dateStr: string) => {
  const seconds = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

export const fetchLiveSorobanBalance = async (walletAddress: string) => {
  if (!walletAddress || !walletAddress.startsWith("G")) return null;
  try {
    const server = new rpc.Server("https://soroban-testnet.stellar.org");
    const tokenContractId = import.meta.env.VITE_TESTNET_USDC || "CCRKWNDORTBX5XFCQIM7PZEH6AEBZSPYKAWOYL65DL3OYIXO65Y3UYGJ";
    const tokenContract = new Contract(tokenContractId);
    
    const dummyAccount = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");
    const tx = new TransactionBuilder(dummyAccount, { fee: "100", networkPassphrase: Networks.TESTNET })
      .addOperation(tokenContract.call("balance", new Address(walletAddress).toScVal()))
      .setTimeout(30)
      .build();

    const simResponse = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationSuccess(simResponse)) {
       const stroops = scValToNative(simResponse.result!.retval);
       return Number(stroops) / 10000000;
    }
    return null;
  } catch (error) {
    return null;
  }
};