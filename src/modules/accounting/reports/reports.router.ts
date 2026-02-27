import { createRouter } from '@/configs/serverConfig';
import { validateRequest } from '@/middlewares/zod-validate-request';
import { z } from 'zod';
import { uploadJournalCsv } from '@/configs/multer';
import ReportsHandler from './reports.handler';

const router = createRouter();

/** Accepts ISO date/datetime strings (e.g. 2025-02-10, 2025-02-10T00:00:00Z) */
const dateString = z.string().refine((s) => !isNaN(new Date(s).getTime()), {
  message: 'Invalid date format',
});

router.get(
  '/trial-balance',
  validateRequest({
    query: z.object({
      asOfDate: dateString.optional(),
    }),
  }),
  ReportsHandler.getTrialBalance
);

router.get(
  '/balance-sheet',
  validateRequest({
    query: z.object({
      asOfDate: dateString.optional(),
    }),
  }),
  ReportsHandler.getBalanceSheet
);

router.get(
  '/net-income',
  validateRequest({
    query: z.object({
      periodFrom: dateString,
      periodTo: dateString,
    }),
  }),
  ReportsHandler.getNetIncome
);

router.get(
  '/inventory-valuation',
  validateRequest({
    query: z.object({
      asOfDate: dateString.optional(),
      inventoryParentCode: z.string().optional(),
    }),
  }),
  ReportsHandler.getInventoryValuation
);

router.get(
  '/gst-summary',
  validateRequest({
    query: z.object({
      periodFrom: dateString,
      periodTo: dateString,
    }),
  }),
  ReportsHandler.getGSTSummary
);

// ─── P&L and Cash Flow (POST with config in body; config uses account codes) ─
const pnlLineItem = z.object({
  label: z.string(),
  accountCodes: z.array(z.string()),
});

const pnlConfigSchema = z.object({
  revenue: z.array(pnlLineItem).optional(),
  cogs: z.array(pnlLineItem).optional(),
  operatingExpenses: z.array(pnlLineItem).optional(),
  otherIncome: z.array(pnlLineItem).optional(),
  otherExpenses: z.array(pnlLineItem).optional(),
});

const cashFlowLineItem = z.object({
  label: z.string(),
  accountCodes: z.array(z.string()),
  sign: z.enum(['positive', 'negative']).optional(),
});

const cashFlowConfigSchema = z.object({
  operating: z.array(cashFlowLineItem).optional(),
  investing: z.array(cashFlowLineItem).optional(),
  financing: z.array(cashFlowLineItem).optional(),
});

const periodBody = z.object({
  periodFrom: dateString,
  periodTo: dateString,
  config: pnlConfigSchema.optional(),
});

router.post(
  '/profit-loss',
  validateRequest({
    body: periodBody,
  }),
  ReportsHandler.getPnL
);

router.post(
  '/cash-flow',
  validateRequest({
    body: periodBody.extend({
      config: cashFlowConfigSchema.optional(),
    }),
  }),
  ReportsHandler.getCashFlow
);

// ─── GST Reconciliation (GSTR-2B CSV upload + books from journals) ────────────

router.post(
  '/gst-reconciliation',
  uploadJournalCsv.single('file'),
  ReportsHandler.gstReconciliation
);

export default router;
