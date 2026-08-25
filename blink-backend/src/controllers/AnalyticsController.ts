// src/controllers/AnalyticsController.ts
import { Request, Response } from 'express';
import { db } from '../db';
import { transactions, escrows, users } from '../schema';
import { eq, and, sql, desc, gte, lte, inArray, or } from 'drizzle-orm';
import { logger } from '../logger';

export const AnalyticsController = {

  getRadarInsights: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId || (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      let end = new Date();
      let start = new Date(new Date().setDate(end.getDate() - 30));

      if (req.query.endDate && !isNaN(new Date(req.query.endDate as string).getTime())) {
          end = new Date(req.query.endDate as string);
      }
      if (req.query.startDate && !isNaN(new Date(req.query.startDate as string).getTime())) {
          start = new Date(req.query.startDate as string);
      }

      if (start > end) {
          const temp = start; start = end; end = temp;
      }

      end.setUTCHours(23, 59, 59, 999);
      start.setUTCHours(0, 0, 0, 0);

      const MAX_DAYS = 365;
      const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > MAX_DAYS) {
          start = new Date(end.getTime() - (MAX_DAYS * 24 * 60 * 60 * 1000));
          start.setUTCHours(0, 0, 0, 0); 
      }

      const isMonthly = daysDiff > 90;

      const timeBucketSql = isMonthly 
          ? sql`DATE_TRUNC('month', ${transactions.createdAt})` 
          : sql`DATE_TRUNC('day', ${transactions.createdAt})`;
          
      const timeFormatSql = isMonthly 
          ? sql<string>`TO_CHAR(${timeBucketSql}, 'YYYY-MM')` 
          : sql<string>`TO_CHAR(${timeBucketSql}, 'YYYY-MM-DD')`;

      const normalizeOutflowSql = sql<string>`
        CASE 
          WHEN ${transactions.type} = 'bulk_payment' THEN 'Batch Escrow Deployments'
          WHEN ${transactions.description} LIKE 'Blink Escrow: Payment to %' THEN REPLACE(${transactions.description}, 'Blink Escrow: Payment to ', '')
          ELSE 'External Withdrawals'
        END
      `;

      const normalizeInflowSql = sql<string>`
        CASE 
          WHEN ${transactions.description} LIKE 'Yield Harvest:%' THEN 'DeFindex Yield Protocol'
          WHEN ${transactions.description} LIKE 'Incoming Payment from %' THEN REPLACE(${transactions.description}, 'Incoming Payment from ', '')
          ELSE 'External Deposits'
        END
      `;

      // =========================================================================
      // 🛡️ THE IRON FENCE: Strict Multi-Tenant Context Isolation
      // Neutralizes Axios 'null' string traps and mathematically sandboxes the DB
      // =========================================================================
      const rawSubId = req.query.subAccountId;
      const activeSubId = (rawSubId !== undefined && rawSubId !== null && rawSubId !== "null" && rawSubId !== "undefined" && rawSubId !== "") ? String(rawSubId) : null;

      const userAndSubAccountsFilter = activeSubId
          ? eq(transactions.subAccountId, activeSubId)
          : and(eq(transactions.userId, userId), sql`(${transactions.subAccountId} IS NULL OR CAST(${transactions.subAccountId} AS TEXT) = 'null')`);

      const escrowFilter = activeSubId
          ? eq(escrows.subAccountId, activeSubId)
          : and(eq(escrows.creatorId, userId), sql`(${escrows.subAccountId} IS NULL OR CAST(${escrows.subAccountId} AS TEXT) = 'null')`);

      // ============================================================================
      // 🚀 PARALLEL DATABASE EXECUTION
      // ============================================================================
      const [
        kpiMetrics, 
        activeEscrows, 
        rawChartData, 
        rawMoneyOutBreakdown, 
        rawMoneyInBreakdown
      ] = await Promise.all([
        db.select({
          totalIn: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} IN ('deposit', 'incoming_escrow', 'fiat_deposit') THEN CAST(${transactions.amount} AS NUMERIC) ELSE 0 END), 0)`,
          totalOut: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} IN ('payment', 'withdrawal', 'bulk_payment') THEN CAST(${transactions.amount} AS NUMERIC) ELSE 0 END), 0)`,
          outflowTxCount: sql<number>`COUNT(CASE WHEN ${transactions.type} IN ('payment', 'withdrawal', 'bulk_payment') THEN 1 END)`,
          yieldHarvested: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.reference} LIKE '%_yield' THEN CAST(${transactions.amount} AS NUMERIC) ELSE 0 END), 0)`
        })
        .from(transactions)
        .where(
          and(
            userAndSubAccountsFilter,
            inArray(transactions.status, ['completed', 'settled', 'processing']),
            gte(transactions.createdAt, start),
            lte(transactions.createdAt, end)
          )
        ),

        db.select({
          lockedVolume: sql<number>`COALESCE(SUM(CAST(${escrows.amountLocked} AS NUMERIC)), 0)`
        })
        .from(escrows)
        .where(
          and(
            escrowFilter, // 🛡️ IRON FENCE APPLIED: Sandboxes active escrow KPIs
            inArray(escrows.status, ['Active', 'Ready', 'in_escrow', 'pending', 'claim_started', 'claim_processing'])
          )
        ),

        db.select({
          date: timeFormatSql,
          inflow: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} IN ('deposit', 'incoming_escrow', 'fiat_deposit') THEN CAST(${transactions.amount} AS NUMERIC) ELSE 0 END), 0)`,
          outflow: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} IN ('payment', 'withdrawal', 'bulk_payment') THEN CAST(${transactions.amount} AS NUMERIC) ELSE 0 END) * -1, 0)`
        })
        .from(transactions)
        .where(
          and(
            userAndSubAccountsFilter,
            inArray(transactions.status, ['completed', 'settled']),
            gte(transactions.createdAt, start),
            lte(transactions.createdAt, end)
          )
        )
        .groupBy(timeBucketSql)
        .orderBy(timeBucketSql),

        db.select({
          category: normalizeOutflowSql,
          amount: sql<number>`COALESCE(SUM(CAST(${transactions.amount} AS NUMERIC)), 0)`
        })
        .from(transactions)
        .where(
          and(
            userAndSubAccountsFilter,
            inArray(transactions.type, ['payment', 'withdrawal', 'bulk_payment']),
            inArray(transactions.status, ['completed', 'settled', 'processing']),
            gte(transactions.createdAt, start),
            lte(transactions.createdAt, end)
          )
        )
        .groupBy(normalizeOutflowSql)
        .orderBy(desc(sql`SUM(CAST(${transactions.amount} AS NUMERIC))`))
        .limit(6),

        db.select({
          category: normalizeInflowSql,
          amount: sql<number>`COALESCE(SUM(CAST(${transactions.amount} AS NUMERIC)), 0)`
        })
        .from(transactions)
        .where(
          and(
            userAndSubAccountsFilter,
            inArray(transactions.type, ['deposit', 'incoming_escrow', 'fiat_deposit']),
            inArray(transactions.status, ['completed', 'settled']),
            gte(transactions.createdAt, start),
            lte(transactions.createdAt, end)
          )
        )
        .groupBy(normalizeInflowSql)
        .orderBy(desc(sql`SUM(CAST(${transactions.amount} AS NUMERIC))`))
        .limit(6)
      ]);

      const kpiData = kpiMetrics[0];
      const lockedEscrowData = activeEscrows[0];

      const estimatedWireFeesAvoided = Number(kpiData.outflowTxCount) * 25.00;
      const estimatedFxSpreadAvoided = Number(kpiData.totalOut) * 0.01;
      const capitalSaved = estimatedWireFeesAvoided + estimatedFxSpreadAvoided;

      const continuousChartData = [];
      let currentDate = new Date(start);
      if (isMonthly) {
          currentDate.setUTCDate(1); 
      }

      const dataMap = new Map(rawChartData.map(item => [item.date, item]));

      while (currentDate <= end) {
          const dateStr = isMonthly 
              ? `${currentDate.getUTCFullYear()}-${String(currentDate.getUTCMonth() + 1).padStart(2, '0')}`
              : `${currentDate.getUTCFullYear()}-${String(currentDate.getUTCMonth() + 1).padStart(2, '0')}-${String(currentDate.getUTCDate()).padStart(2, '0')}`;
          
          continuousChartData.push({
              date: dateStr,
              inflow: dataMap.has(dateStr) ? Number(dataMap.get(dateStr)!.inflow) : 0,
              outflow: dataMap.has(dateStr) ? Number(dataMap.get(dateStr)!.outflow) : 0
          });
          
          if (isMonthly) {
              currentDate.setUTCMonth(currentDate.getUTCMonth() + 1);
          } else {
              currentDate.setUTCDate(currentDate.getUTCDate() + 1); 
          }
      }

      // 🌟 THE FIX 2: Float-Clamped Remainder Math
      const moneyOutBreakdown = rawMoneyOutBreakdown.map(item => ({
        recipient: item.category,
        amount: Number(item.amount),
        percentage: Number(kpiData.totalOut) > 0 ? ((Number(item.amount) / Number(kpiData.totalOut)) * 100).toFixed(1) : "0.0"
      }));

      const topOutflowsSum = moneyOutBreakdown.reduce((sum, item) => sum + item.amount, 0);
      const remainingOutflow = Number((Number(kpiData.totalOut) - topOutflowsSum).toFixed(2));

      if (remainingOutflow > 0.01 && rawMoneyOutBreakdown.length === 6) {
          moneyOutBreakdown.push({
              recipient: "Remaining recipients",
              amount: remainingOutflow,
              percentage: ((remainingOutflow / Number(kpiData.totalOut)) * 100).toFixed(1)
          });
      }

      const moneyInBreakdown = rawMoneyInBreakdown.map(item => ({
        source: item.category,
        amount: Number(item.amount),
        percentage: Number(kpiData.totalIn) > 0 ? ((Number(item.amount) / Number(kpiData.totalIn)) * 100).toFixed(1) : "0.0"
      }));

      const topInflowsSum = moneyInBreakdown.reduce((sum, item) => sum + item.amount, 0);
      const remainingInflow = Number((Number(kpiData.totalIn) - topInflowsSum).toFixed(2));

      if (remainingInflow > 0.01 && rawMoneyInBreakdown.length === 6) {
          moneyInBreakdown.push({
              source: "Remaining sources",
              amount: remainingInflow,
              percentage: ((remainingInflow / Number(kpiData.totalIn)) * 100).toFixed(1)
          });
      }

      const insights: string[] = [];
      const netFlow = Number(kpiData.totalIn) - Number(kpiData.totalOut);
      
      if (netFlow > 0) {
          insights.push(`Your net cash flow is positive. You brought in $${netFlow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} more than you sent out this period.`);
      } else if (netFlow < 0) {
          insights.push(`Your net cash flow is negative at -$${Math.abs(netFlow).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Monitor your runway closely.`);
      }

      if (Number(kpiData.yieldHarvested) > 0) {
          insights.push(`Idle capital optimization is working. You harvested $${Number(kpiData.yieldHarvested).toFixed(2)} in automated yield this period.`);
      }

      if (capitalSaved > 0) {
          insights.push(`By utilizing Blink's stablecoin rails instead of legacy banking, you avoided an estimated $${capitalSaved.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} in FX spread and wire fees.`);
      }

      res.status(200).json({
        success: true,
        data: {
          kpis: {
            totalIn: Number(kpiData.totalIn),
            totalOut: Number(kpiData.totalOut),
            netFlow: netFlow,
            yieldHarvested: Number(kpiData.yieldHarvested),
            capitalSaved: capitalSaved,
            activeEscrowVolume: Number(lockedEscrowData.lockedVolume)
          },
          chartData: continuousChartData,
          moneyOutBreakdown,
          moneyInBreakdown,
          insights
        }
      });

    } catch (error: any) {
      logger.error({ err: error }, "Failed to generate Radar Insights");
      res.status(500).json({ error: "Failed to load analytics engine." });
    }
  }
};