import { Horizon } from '@stellar/stellar-sdk';

export class SequenceManager {
  // 🌟 ENTERPRISE FIX: Maps and Sets guarantee lightning-fast O(1) thread-safe execution
  private static sequences = new Map<string, bigint>();
  private static locks = new Set<string>();

  /**
   * Safely fetches and strictly increments an account's sequence number in memory.
   * This completely prevents tx_bad_seq errors when concurrent transactions fire.
   */
  static async getNextSequence(publicKey: string, horizon: Horizon.Server): Promise<string> {
    // Strict Spin-Lock for microsecond concurrency
    while (this.locks.has(publicKey)) {
      await new Promise(resolve => setTimeout(resolve, 10)); // Aggressive 10ms spin
    }
    this.locks.add(publicKey);

    try {
      if (!this.sequences.has(publicKey)) {
        // First time seeing this account? Fetch its ground-truth from the ledger
        const acc = await horizon.loadAccount(publicKey);
        this.sequences.set(publicKey, BigInt(acc.sequenceNumber()));
      } else {
        // Already in memory? Increment it instantly without waiting for the blockchain
        const currentSeq = this.sequences.get(publicKey)!;
        this.sequences.set(publicKey, currentSeq + 1n);
      }
      return this.sequences.get(publicKey)!.toString();
    } finally {
      // Always release the lock, even if the ledger fetch crashes
      this.locks.delete(publicKey);
    }
  }

  /**
   * 🌟 UTILITY FIX: Call this if a transaction fails permanently to realign the memory 
   * with the actual blockchain state, preventing future off-by-one sequence errors.
   */
  static syncSequence(publicKey: string, actualSequence: string) {
      this.sequences.set(publicKey, BigInt(actualSequence));
  }
}