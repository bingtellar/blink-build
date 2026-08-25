// tests/integration/escrowBoundary.test.ts
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/db';
import { escrows, transactions, users } from '../../src/schema';
import { eq } from 'drizzle-orm';
import { processEscrowDeployment } from '../../src/services/EscrowService';
import { SorobanService } from '../../src/services/SorobanService';

describe('Escrow Deployment Boundary', () => {
  const mockClaimId = `trx_test_${Date.now()}`;
  let testUserId: string;

  // Setup: Create a temporary user and pending escrow in the DB before testing
  beforeAll(async () => {
    const newUser = await db.insert(users).values({
      email: `test_${Date.now()}@test.com`,
      firstName: "Test",
      lastName: "User",
    }).returning();
    
    testUserId = newUser[0].id;

    await db.insert(escrows).values({
      creatorId: testUserId,
      claimId: mockClaimId,
      amountLocked: "100.00",
      status: "pending",
      recipientEmail: "recipient@test.com"
    });

    await db.insert(transactions).values({
      userId: testUserId,
      amount: "100.00",
      type: "payment",
      reference: mockClaimId,
      status: "pending"
    });
  });

  // Cleanup: Delete the test data after the test finishes
  afterAll(async () => {
    await db.delete(users).where(eq(users.id, testUserId)); // Cascades to escrows/transactions
  });

  it('should atomically update both escrows and transactions tables with the contract hash', async () => {
    const mockContractId = "CCRK_MOCK_CONTRACT_ID_1234567890123456789012345678901234"; // 56 chars

    // Intercept the blockchain call so we don't actually spend network gas during the test
    vi.spyOn(SorobanService, 'submitSponsoredTransaction').mockResolvedValue(mockContractId);

    // Run the boundary logic
    await processEscrowDeployment(mockClaimId, "mock_xdr_string");

    // Fetch the final state directly from Postgres
    const escrowRecord = await db.select().from(escrows).where(eq(escrows.claimId, mockClaimId));
    const txRecord = await db.select().from(transactions).where(eq(transactions.reference, mockClaimId));

    // The Ultimate Boundary Assertions
    expect(escrowRecord[0].contractId).toBe(mockContractId);
    expect(txRecord[0].txHash).toBe(mockContractId); 
    expect(escrowRecord[0].contractId).toEqual(txRecord[0].txHash);
  });
});