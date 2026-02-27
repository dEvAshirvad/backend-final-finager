import { Types } from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import { COAModel, type COA } from '../coa/coa.model';
import { JournalEntryModel } from '../journal/journal.model';

type OrganizationId = string;
type AccountId = string;

/** Balance per account: debit/credit columns for trial balance display */
export interface TrialBalanceRow {
  accountId: AccountId;
  accountCode: string;
  accountName: string;
  accountType: string;
  debitBalance: number;
  creditBalance: number;
}

export interface TrialBalanceReport {
  asOf: Date;
  accounts: TrialBalanceRow[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
  difference?: number;
}

/** Account balance for balance sheet (optional children for hierarchy) */
export interface AccountBalance {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  balance: number;
  parentCode?: string | null;
  children?: AccountBalance[];
}

/** Balance sheet sections */
export interface BalanceSheetSection {
  type: 'ASSET' | 'LIABILITY' | 'EQUITY';
  label: string;
  accounts: AccountBalance[];
  total: number;
}

export interface BalanceSheetReport {
  asOf: Date;
  assets: BalanceSheetSection;
  liabilities: BalanceSheetSection;
  equity: BalanceSheetSection;
  netIncome: number;
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
  difference?: number;
}

/** Inventory valuation row */
export interface InventoryValuationRow {
  accountId: AccountId;
  code: string;
  name: string;
  balance: number;
}

export interface InventoryValuationReport {
  asOfDate: Date;
  rows: InventoryValuationRow[];
  totalValue: number;
}

/** GSTR-3B Table 3.1 - Outward supplies */
export interface GSTR3BTable31 {
  '3.1(a)': { description: string; taxableValue: number; tax: number };
  '3.1(b)': { description: string; taxableValue: number; tax: number };
  '3.1(c)': { description: string; taxableValue: number; tax: number };
  '3.1(d)': { description: string; taxableValue: number; tax: number };
  '3.1(e)': { description: string; taxableValue: number; tax: number };
}

/** GSTR-3B Table 4 - ITC */
export interface GSTR3BTable4 {
  '4A': { totalITCAvailable: number };
  '4A(1)': { description: string; amount: number };
  '4A(2)': { description: string; amount: number };
  '4A(3)': { description: string; amount: number };
  '4A(4)': { description: string; amount: number };
  '4A(5)': { description: string; amount: number };
  '4B': { itcReversals: number };
  '4C': { netITC: number };
  '4D': { ineligibleITC: number };
}

export interface GSTSummaryReport {
  periodFrom: Date;
  periodTo: Date;
  table31: GSTR3BTable31;
  table4: GSTR3BTable4;
  note?: string;
}

// ─── GST Reconciliation (GSTR-2B vs Books) ────────────────────────────────────

export interface GSTR2BRow {
  gstin: string;
  tradeName: string;
  invoiceNumber: string;
  invoiceType: string;
  invoiceDate: Date;
  invoiceValue: number;
  placeOfSupply: string;
  reverseCharge: string;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
}

export interface GSTBooksITCRow {
  journalId: string;
  reference?: string;
  date?: Date;
  amount: number;
}

export interface GSTReconciliationSummary {
  gstr2bItc: number;
  booksItc: number;
  difference: number;
  matchedCount: number;
  missingInBooksCount: number;
  missingInGstr2bCount: number;
}

export interface GSTReconciliationBucketRow {
  gstin?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  gstr2b?: {
    taxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
  };
  books?: {
    journalReferences: string[];
    itcAmount: number;
  };
}

export interface GSTReconciliationReport {
  period: { from: Date; to: Date };
  summary: GSTReconciliationSummary;
  buckets: {
    matched: GSTReconciliationBucketRow[];
    amountMismatch: GSTReconciliationBucketRow[];
    dateMismatch: GSTReconciliationBucketRow[];
    missingInBooks: GSTReconciliationBucketRow[];
    missingInGstr2b: GSTReconciliationBucketRow[];
  };
}

// ─── P&L (Profit & Loss) Report ─────────────────────────────────────────────
/** Config uses account codes (e.g. "4000", "5000") for portability across orgs. */
export interface PnLLineItem {
  label: string;
  accountCodes: string[];
}

export interface PnLConfig {
  revenue?: PnLLineItem[];
  cogs?: PnLLineItem[];
  operatingExpenses?: PnLLineItem[];
  otherIncome?: PnLLineItem[];
  otherExpenses?: PnLLineItem[];
}

export interface PnLSection {
  label: string;
  lineItems: {
    label: string;
    accountCodes: string[];
    amount: number;
    accounts?: { code: string; name: string; amount: number }[];
  }[];
  total: number;
}

export interface PnLReport {
  periodFrom: Date;
  periodTo: Date;
  revenue: PnLSection;
  cogs: PnLSection;
  grossProfit: number;
  operatingExpenses: PnLSection;
  operatingIncome: number;
  otherIncome: PnLSection;
  otherExpenses: PnLSection;
  netIncome: number;
  usedDefaultConfig: boolean;
}

// ─── Cash Flow Report ───────────────────────────────────────────────────────
/** Config uses account codes for portability across orgs. */
export interface CashFlowLineItem {
  label: string;
  accountCodes: string[];
  sign?: 'positive' | 'negative';
}

export interface CashFlowConfig {
  operating?: CashFlowLineItem[];
  investing?: CashFlowLineItem[];
  financing?: CashFlowLineItem[];
}

/** Single cash flow item; may include journal reference/date/description when from journal entries */
export interface CashFlowItemDetail {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  amount: number;
  description?: string;
  date?: Date;
  reference?: string;
}

export interface CashFlowSection {
  label: string;
  lineItems: {
    label: string;
    accountCodes: string[];
    amount: number;
    accounts?: { code: string; name: string; amount: number }[];
  }[];
  items?: CashFlowItemDetail[];
  total: number;
}

export interface CashFlowReport {
  period: { from: Date; to: Date };
  openingCashBalance: number;
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  netCashFlow: number;
  closingCashBalance: number;
  usedDefaultConfig: boolean;
}

export interface NetIncomeReport {
  period: { from: Date; to: Date };
  revenue: number;
  expenses: number;
  netIncome: number;
}

/** Compute balances as of date from journals (POSTED only). Falls back to COA currentBalance when no asOfDate. */
async function getBalancesAsOfDate(
  organizationId: OrganizationId,
  asOfDate?: Date
): Promise<Map<AccountId, number>> {
  const orgObjectId = new Types.ObjectId(organizationId);
  const accounts = await COAModel.find({
    organizationId: orgObjectId,
  } as object).lean();

  const balanceMap = new Map<AccountId, number>();

  for (const acc of accounts) {
    const id = (acc as { _id: Types.ObjectId })._id.toString();
    balanceMap.set(id, 0);
  }

  if (asOfDate) {
    // Recalculate from journals: only POSTED, date <= asOfDate
    // Note: REVERSED journals are excluded. For correct historical reporting, add reversedAt when reversing.
    const pipeline = [
      {
        $match: {
          organizationId: orgObjectId,
          status: 'POSTED',
          date: { $lte: asOfDate },
        },
      },
      { $unwind: '$lines' },
      {
        $group: {
          _id: '$lines.accountId',
          delta: {
            $sum: { $subtract: ['$lines.debit', '$lines.credit'] },
          },
        },
      },
    ];

    type JournalBalanceRow = { _id: Types.ObjectId; delta: number };
    const journalBalances = (await JournalEntryModel.aggregate(
      pipeline
    )) as JournalBalanceRow[];

    for (const acc of accounts) {
      const id = (acc as { _id: Types.ObjectId })._id.toString();
      const opening = (acc as { openingBalance?: number }).openingBalance ?? 0;
      const journalRow: JournalBalanceRow | undefined = journalBalances.find(
        (r) => r._id.toString() === id
      );
      const delta = journalRow?.delta ?? 0;
      balanceMap.set(id, opening + delta);
    }
  } else {
    // Use currentBalance from COA (reflects latest posted state)
    for (const acc of accounts) {
      const id = (acc as { _id: Types.ObjectId })._id.toString();
      const current = (acc as { currentBalance?: number }).currentBalance ?? 0;
      const opening = (acc as { openingBalance?: number }).openingBalance ?? 0;
      // currentBalance = opening + all posted deltas - reversed deltas
      balanceMap.set(id, current);
    }
  }

  return balanceMap;
}

/** Get accounts by org as a map (id -> account) */
async function getAccountsMap(
  organizationId: OrganizationId
): Promise<Map<AccountId, COA & { _id: Types.ObjectId }>> {
  const accounts = await COAModel.find({
    organizationId: new Types.ObjectId(organizationId),
  } as object)
    .lean()
    .exec();

  const map = new Map<AccountId, COA & { _id: Types.ObjectId }>();
  for (const a of accounts) {
    const id = (a as { _id: Types.ObjectId })._id.toString();
    map.set(id, a as COA & { _id: Types.ObjectId });
  }
  return map;
}

/** Resolve COA account codes to account IDs for the organization. Returns map code -> id; missing codes are omitted. */
async function resolveAccountCodesToIds(
  organizationId: OrganizationId,
  codes: string[]
): Promise<Map<string, string>> {
  if (codes.length === 0) return new Map();
  const accounts = await (COAModel as any)
    .find({
      organizationId: new Types.ObjectId(organizationId),
      code: { $in: codes },
    })
    .lean()
    .exec();
  const map = new Map<string, string>();
  for (const a of accounts) {
    const code = (a as { code?: string }).code;
    if (code != null)
      map.set(String(code), (a as { _id: Types.ObjectId })._id.toString());
  }
  return map;
}

/** Default P&L config using standard COA codes (works for any org using retail/serviceBased/manufacturing template). */
export function getDefaultPnLConfig(): PnLConfig {
  return {
    revenue: [
      { label: 'Sales Revenue', accountCodes: ['4000'] },
      { label: 'Sales Returns', accountCodes: ['4100'] },
      { label: 'Other Income', accountCodes: ['4200'] },
    ],
    cogs: [{ label: 'Cost of Goods Sold', accountCodes: ['5000'] }],
    operatingExpenses: [
      { label: 'Salaries and Wages', accountCodes: ['5100'] },
      { label: 'Rent Expense', accountCodes: ['5200'] },
      { label: 'Utilities Expense', accountCodes: ['5300'] },
      { label: 'Advertising Expense', accountCodes: ['5400'] },
      { label: 'Depreciation Expense', accountCodes: ['5500'] },
    ],
    otherIncome: [],
    otherExpenses: [{ label: 'Interest Expense', accountCodes: ['5600'] }],
  };
}

/** Default Cash Flow config using standard COA codes. */
export function getDefaultCashFlowConfig(): CashFlowConfig {
  return {
    operating: [
      {
        label: 'Cash and Bank',
        accountCodes: ['1001', '1002'],
        sign: 'positive',
      },
      {
        label: 'Accounts Receivable',
        accountCodes: ['1100'],
        sign: 'positive',
      },
      { label: 'Accounts Payable', accountCodes: ['2000'], sign: 'negative' },
    ],
    investing: [
      {
        label: 'Equipment and Assets',
        accountCodes: ['1400'],
        sign: 'negative',
      },
    ],
    financing: [
      { label: 'Short-Term Loans', accountCodes: ['2100'], sign: 'positive' },
      { label: 'Long-Term Debt', accountCodes: ['2300'], sign: 'positive' },
      { label: "Owner's Capital", accountCodes: ['3000'], sign: 'positive' },
    ],
  };
}

/** Sum of balances for given account IDs as of date (from posted journals). */
async function getBalanceSumAsOfDate(
  organizationId: OrganizationId,
  asOfDate: Date,
  accountIds: string[]
): Promise<number> {
  if (accountIds.length === 0) return 0;
  const balances = await getBalancesAsOfDate(organizationId, asOfDate);
  return accountIds.reduce((s, id) => s + (balances.get(id) ?? 0), 0);
}

/** Determine which cash-flow section an account code belongs to (from config). */
function getSectionForAccountCode(
  code: string,
  config: CashFlowConfig
): 'operating' | 'investing' | 'financing' {
  for (const item of config.operating ?? []) {
    if (item.accountCodes.includes(code)) return 'operating';
  }
  for (const item of config.investing ?? []) {
    if (item.accountCodes.includes(code)) return 'investing';
  }
  for (const item of config.financing ?? []) {
    if (item.accountCodes.includes(code)) return 'financing';
  }
  return 'operating';
}

/** Build journal-level cash flow items from posted journals in period (touch cash accounts). */
async function getCashFlowJournalItems(
  organizationId: OrganizationId,
  periodFrom: Date,
  periodTo: Date,
  cashAccountIds: string[],
  config: CashFlowConfig,
  accountsMap: Map<AccountId, COA & { _id: Types.ObjectId }>
): Promise<{
  operating: CashFlowItemDetail[];
  investing: CashFlowItemDetail[];
  financing: CashFlowItemDetail[];
}> {
  const cashSet = new Set(cashAccountIds);
  const operating: CashFlowItemDetail[] = [];
  const investing: CashFlowItemDetail[] = [];
  const financing: CashFlowItemDetail[] = [];

  const journals = await JournalEntryModel.find({
    organizationId: new Types.ObjectId(organizationId),
    status: 'POSTED',
    date: { $gte: periodFrom, $lte: periodTo },
  })
    .sort({ date: 1 })
    .lean();

  for (const j of journals) {
    const raw = j as unknown as {
      lines?: {
        accountId: Types.ObjectId | string;
        debit?: number;
        credit?: number;
      }[];
      description?: string;
      date?: Date;
      reference?: string;
    };
    const lines = raw.lines ?? [];
    let cashAmount = 0;
    let counterAccountId: string | null = null;
    for (const line of lines) {
      const aid =
        typeof line.accountId === 'string'
          ? line.accountId
          : ((line.accountId &&
              (line.accountId as Types.ObjectId).toString()) ??
            '');
      if (cashSet.has(aid)) {
        cashAmount += (line.debit ?? 0) - (line.credit ?? 0);
      } else {
        if (!counterAccountId) counterAccountId = aid;
      }
    }
    if (Math.abs(cashAmount) < 0.01 || !counterAccountId) continue;

    const acc = counterAccountId ? accountsMap.get(counterAccountId) : null;
    const accountCode = (acc as { code?: string })?.code ?? '';
    const accountName = (acc as { name?: string })?.name ?? '';
    const accountType = (
      (acc as { type?: string })?.type ?? 'ASSET'
    ).toLowerCase();
    const item: CashFlowItemDetail = {
      accountId: counterAccountId,
      accountCode,
      accountName,
      accountType,
      amount: Math.round(cashAmount * 100) / 100,
      description: raw.description,
      date: raw.date,
      reference: raw.reference,
    };
    const section = getSectionForAccountCode(accountCode, config);
    if (section === 'operating') operating.push(item);
    else if (section === 'investing') investing.push(item);
    else financing.push(item);
  }

  return { operating, investing, financing };
}

/** If date is at midnight UTC, return end of that day (23:59:59.999 UTC) so the full calendar day is included. */
function toEndOfDayUTC(date: Date): Date {
  const d = new Date(date);
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0
  ) {
    d.setUTCHours(23, 59, 59, 999);
  }
  return d;
}

/** Period movement (debit - credit) per account for POSTED journals in date range. periodTo is inclusive of full day (end-of-day UTC). */
async function getPeriodMovements(
  organizationId: OrganizationId,
  periodFrom: Date,
  periodTo: Date
): Promise<Map<AccountId, number>> {
  const effectivePeriodTo = toEndOfDayUTC(periodTo);
  const orgObjectId = new Types.ObjectId(organizationId);
  type AggRow = { _id: Types.ObjectId; delta: number };
  const result = (await JournalEntryModel.aggregate([
    {
      $match: {
        organizationId: orgObjectId,
        status: 'POSTED',
        date: { $gte: periodFrom, $lte: effectivePeriodTo },
      },
    },
    { $unwind: '$lines' },
    {
      $group: {
        _id: '$lines.accountId',
        delta: { $sum: { $subtract: ['$lines.debit', '$lines.credit'] } },
      },
    },
  ])) as AggRow[];

  const map = new Map<AccountId, number>();
  for (const row of result) {
    map.set(row._id.toString(), row.delta);
  }
  return map;
}

export default class ReportsServices {
  /**
   * Trial Balance: all accounts with debit/credit columns.
   * Debit-normal accounts (ASSET, EXPENSE): positive balance -> debit column.
   * Credit-normal (LIABILITY, EQUITY, INCOME): positive balance -> credit column.
   */
  static async getTrialBalance(
    organizationId: OrganizationId,
    asOfDate?: Date
  ): Promise<TrialBalanceReport> {
    const [accountsMap, balances] = await Promise.all([
      getAccountsMap(organizationId),
      getBalancesAsOfDate(organizationId, asOfDate),
    ]);

    const rows: TrialBalanceRow[] = [];
    let totalDebit = 0;
    let totalCredit = 0;

    const sortedAccounts = Array.from(accountsMap.values()).sort((a, b) =>
      (a.code ?? '').localeCompare(b.code ?? '')
    );

    for (const acc of sortedAccounts) {
      const id = (acc as { _id?: Types.ObjectId })._id?.toString() ?? '';
      const bal = balances.get(id) ?? 0;
      const normalBalance =
        (acc as { normalBalance?: string }).normalBalance ?? 'DEBIT';
      let debit = 0;
      let credit = 0;

      if (normalBalance === 'DEBIT') {
        // ASSET, EXPENSE: positive = debit balance, negative = credit balance
        debit = bal > 0 ? bal : 0;
        credit = bal < 0 ? -bal : 0;
      } else {
        // LIABILITY, EQUITY, INCOME: negative stored = credit balance, positive = debit balance
        credit = bal < 0 ? -bal : 0;
        debit = bal > 0 ? bal : 0;
      }

      totalDebit += debit;
      totalCredit += credit;

      rows.push({
        accountId: id,
        accountCode: (acc as { code?: string }).code ?? '',
        accountName: (acc as { name?: string }).name ?? '',
        accountType: ((acc as { type?: string }).type ?? 'ASSET').toLowerCase(),
        debitBalance: Math.round(debit * 100) / 100,
        creditBalance: Math.round(credit * 100) / 100,
      });
    }

    const effectiveDate = asOfDate ?? new Date();
    const totalDebits = Math.round(totalDebit * 100) / 100;
    const totalCredits = Math.round(totalCredit * 100) / 100;
    const diff = Math.abs(totalDebits - totalCredits);
    const isBalanced = diff < 0.02;

    return {
      asOf: effectiveDate,
      accounts: rows,
      totalDebits,
      totalCredits,
      isBalanced,
      ...(isBalanced ? {} : { difference: Math.round(diff * 100) / 100 }),
    };
  }

  /**
   * Balance Sheet: Assets = Liabilities + Equity (with Net Income).
   */
  static async getBalanceSheet(
    organizationId: OrganizationId,
    asOfDate?: Date
  ): Promise<BalanceSheetReport> {
    const [accountsMap, balances] = await Promise.all([
      getAccountsMap(organizationId),
      getBalancesAsOfDate(organizationId, asOfDate),
    ]);

    const buildSection = (
      type: BalanceSheetSection['type']
    ): BalanceSheetSection => {
      const accounts = Array.from(accountsMap.values())
        .filter((a) => (a as { type?: string }).type === type)
        .sort((a, b) => (a.code ?? '').localeCompare(b.code ?? ''));

      const rows: AccountBalance[] = accounts
        .map((acc) => {
          const id = (acc as { _id?: Types.ObjectId })._id?.toString() ?? '';
          const bal = balances.get(id) ?? 0;
          const normalBalance =
            (acc as { normalBalance?: string }).normalBalance ?? 'DEBIT';
          const amount = normalBalance === 'DEBIT' ? bal : -bal;
          return {
            accountId: id,
            accountCode: (acc as { code?: string }).code ?? '',
            accountName: (acc as { name?: string }).name ?? '',
            accountType: (
              (acc as { type?: string }).type ?? 'ASSET'
            ).toLowerCase(),
            balance: Math.round(amount * 100) / 100,
          };
        })
        .filter((r) => Math.abs(r.balance) >= 0.01);

      const total = rows.reduce((s, r) => s + r.balance, 0);

      const labels = {
        ASSET: 'Assets',
        LIABILITY: 'Liabilities',
        EQUITY: 'Equity',
      };

      return {
        type,
        label: labels[type],
        accounts: rows,
        total: Math.round(total * 100) / 100,
      };
    };

    const assets = buildSection('ASSET');
    const liabilities = buildSection('LIABILITY');
    const equity = buildSection('EQUITY');

    // Net Income = Revenue - Expenses
    const incomeAccounts = Array.from(accountsMap.values()).filter(
      (a) => (a as { type?: string }).type === 'INCOME'
    );
    const expenseAccounts = Array.from(accountsMap.values()).filter(
      (a) => (a as { type?: string }).type === 'EXPENSE'
    );

    const incomeTotal = incomeAccounts.reduce((s, acc) => {
      const id = (acc as { _id?: Types.ObjectId })._id?.toString() ?? '';
      const bal = balances.get(id) ?? 0;
      return s + bal; // Income is credit-normal, positive = credit
    }, 0);
    const expenseTotal = expenseAccounts.reduce((s, acc) => {
      const id = (acc as { _id?: Types.ObjectId })._id?.toString() ?? '';
      const bal = balances.get(id) ?? 0;
      return s + bal; // Expense is debit-normal, positive = debit
    }, 0);

    const netIncome = Math.round((incomeTotal - expenseTotal) * 100) / 100;
    const totalLiabilitiesAndEquity =
      Math.round((liabilities.total + equity.total + netIncome) * 100) / 100;
    const diff = Math.abs(assets.total - totalLiabilitiesAndEquity);
    const isBalanced = diff < 0.02;
    const effectiveDate = asOfDate ?? new Date();

    return {
      asOf: effectiveDate,
      assets,
      liabilities,
      equity,
      netIncome,
      totalLiabilitiesAndEquity,
      isBalanced,
      ...(isBalanced ? {} : { difference: Math.round(diff * 100) / 100 }),
    };
  }

  /**
   * Net Income: simplified revenue, expenses, net income for the period (from posted journals).
   */
  static async getNetIncome(
    organizationId: OrganizationId,
    periodFrom: Date,
    periodTo: Date
  ): Promise<NetIncomeReport> {
    const [accountsMap, movements] = await Promise.all([
      getAccountsMap(organizationId),
      getPeriodMovements(organizationId, periodFrom, periodTo),
    ]);

    let revenue = 0;
    let expenses = 0;
    for (const acc of accountsMap.values()) {
      const id = (acc as { _id?: Types.ObjectId })._id?.toString() ?? '';
      const delta = movements.get(id) ?? 0;
      const type = (acc as { type?: string }).type ?? '';
      if (type === 'INCOME')
        revenue += -delta; // Income: credit increases
      else if (type === 'EXPENSE') expenses += delta; // Expense: debit increases
    }
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      period: { from: periodFrom, to: periodTo },
      revenue: round(revenue),
      expenses: round(expenses),
      netIncome: round(revenue - expenses),
    };
  }

  /**
   * Inventory Valuation: ASSET accounts (typically inventory).
   * For a more specific report, filter by parentCode (e.g. inventory parent).
   */
  static async getInventoryValuation(
    organizationId: OrganizationId,
    asOfDate?: Date,
    inventoryParentCode?: string
  ): Promise<InventoryValuationReport> {
    const [accountsMap, balances] = await Promise.all([
      getAccountsMap(organizationId),
      getBalancesAsOfDate(organizationId, asOfDate),
    ]);

    let assetAccounts = Array.from(accountsMap.values()).filter(
      (a) => (a as { type?: string }).type === 'ASSET'
    );

    if (inventoryParentCode) {
      assetAccounts = assetAccounts.filter(
        (a) =>
          (a as { parentCode?: string | null }).parentCode ===
            inventoryParentCode ||
          (a as { code?: string }).code?.startsWith(inventoryParentCode)
      );
    }

    const rows: InventoryValuationRow[] = assetAccounts
      .sort((a, b) => (a.code ?? '').localeCompare(b.code ?? ''))
      .map((acc) => {
        const id = (acc as { _id?: Types.ObjectId })._id?.toString() ?? '';
        const bal = balances.get(id) ?? 0;
        return {
          accountId: id,
          code: (acc as { code?: string }).code ?? '',
          name: (acc as { name?: string }).name ?? '',
          balance: Math.round(bal * 100) / 100,
        };
      });

    const totalValue = rows.reduce((s, r) => s + r.balance, 0);

    return {
      asOfDate: asOfDate ?? new Date(),
      rows,
      totalValue: Math.round(totalValue * 100) / 100,
    };
  }

  /**
   * GST Summary: basic GSTR-3B pre-fill structure.
   * Table 3.1: Outward supplies - INCOME for taxable value; output GST accounts (LIABILITY with name/code containing GST/IGST/CGST/SGST) for tax.
   * Table 4: ITC - uses expense/asset GST input accounts when identified.
   * periodTo is normalized to end-of-day UTC so the full end date is included.
   */
  static async getGSTSummary(
    organizationId: OrganizationId,
    periodFrom: Date,
    periodTo: Date
  ): Promise<GSTSummaryReport> {
    const orgObjectId = new Types.ObjectId(organizationId);
    const effectivePeriodTo = toEndOfDayUTC(periodTo);

    // Aggregate INCOME (outward supplies) and EXPENSE (ITC proxy) for the period
    const outwardPipeline = [
      {
        $match: {
          organizationId: orgObjectId,
          status: 'POSTED',
          date: { $gte: periodFrom, $lte: effectivePeriodTo },
        },
      },
      { $unwind: '$lines' },
      {
        $lookup: {
          from: 'coas',
          localField: 'lines.accountId',
          foreignField: '_id',
          as: 'account',
        },
      },
      { $unwind: '$account' },
      {
        $group: {
          _id: '$account.type',
          totalCredit: { $sum: '$lines.credit' },
          totalDebit: { $sum: '$lines.debit' },
        },
      },
    ];

    type OutwardRow = { _id: string; totalCredit: number; totalDebit: number };
    const outwardResult = (await JournalEntryModel.aggregate(
      outwardPipeline
    )) as OutwardRow[];

    const incomeRow: OutwardRow | undefined = outwardResult.find(
      (r) => r._id === 'INCOME'
    );
    const outwardTaxableValue = incomeRow
      ? incomeRow.totalCredit - incomeRow.totalDebit
      : 0;

    // Output GST tax: sum credits to LIABILITY accounts whose name or code suggests output GST (IGST/CGST/SGST/GST)
    const outputGstPipeline = [
      {
        $match: {
          organizationId: orgObjectId,
          status: 'POSTED',
          date: { $gte: periodFrom, $lte: effectivePeriodTo },
        },
      },
      { $unwind: '$lines' },
      {
        $lookup: {
          from: 'coas',
          localField: 'lines.accountId',
          foreignField: '_id',
          as: 'account',
        },
      },
      { $unwind: '$account' },
      {
        $match: {
          'account.type': 'LIABILITY',
          'account.name': { $regex: /output|igst|cgst|sgst|gst/i },
        },
      },
      {
        $group: {
          _id: null,
          totalOutputTax: { $sum: '$lines.credit' },
        },
      },
    ];
    type OutputGstRow = { _id: null; totalOutputTax: number };
    const outputGstResult = (await JournalEntryModel.aggregate(
      outputGstPipeline
    )) as OutputGstRow[];
    const outputTax =
      outputGstResult.length > 0 && outputGstResult[0].totalOutputTax != null
        ? outputGstResult[0].totalOutputTax
        : 0;

    // ITC: sum debits to EXPENSE/ASSET accounts whose name suggests input GST (optional)
    const itcPipeline = [
      {
        $match: {
          organizationId: orgObjectId,
          status: 'POSTED',
          date: { $gte: periodFrom, $lte: effectivePeriodTo },
        },
      },
      { $unwind: '$lines' },
      {
        $lookup: {
          from: 'coas',
          localField: 'lines.accountId',
          foreignField: '_id',
          as: 'account',
        },
      },
      { $unwind: '$account' },
      {
        $match: {
          'account.type': { $in: ['EXPENSE', 'ASSET'] },
          'account.name': { $regex: /input|itc|igst|cgst|sgst|gst/i },
        },
      },
      {
        $group: {
          _id: null,
          totalITC: { $sum: '$lines.debit' },
        },
      },
    ];
    type ItcRow = { _id: null; totalITC: number };
    const itcResult = (await JournalEntryModel.aggregate(
      itcPipeline
    )) as ItcRow[];
    const itcAmount =
      itcResult.length > 0 && itcResult[0].totalITC != null
        ? itcResult[0].totalITC
        : 0;

    const table31: GSTR3BTable31 = {
      '3.1(a)': {
        description:
          'Outward taxable supplies (other than zero-rated, nil-rated, exempt and non-GST)',
        taxableValue: Math.round(outwardTaxableValue * 100) / 100,
        tax:
          Math.round(
            (outputTax > 0 ? outputTax : outwardTaxableValue * 0.18) * 100
          ) / 100,
      },
      '3.1(b)': {
        description: 'Outward taxable supplies (zero-rated)',
        taxableValue: 0,
        tax: 0,
      },
      '3.1(c)': {
        description: 'Other outward supplies (nil-rated, exempted and non-GST)',
        taxableValue: 0,
        tax: 0,
      },
      '3.1(d)': {
        description: 'Inward supplies liable to reverse charge',
        taxableValue: 0,
        tax: 0,
      },
      '3.1(e)': {
        description: 'Non-GST outward supplies',
        taxableValue: 0,
        tax: 0,
      },
    };

    const table4: GSTR3BTable4 = {
      '4A': {
        totalITCAvailable: Math.round(itcAmount * 100) / 100,
      },
      '4A(1)': {
        description: 'ITC on imports of goods (IMPG)',
        amount: 0,
      },
      '4A(2)': {
        description: 'ITC on imports of services (IMPS)',
        amount: 0,
      },
      '4A(3)': {
        description: 'Reverse charge mechanism ITC',
        amount: 0,
      },
      '4A(4)': {
        description: 'ITC from Input Service Distributors (ISD)',
        amount: 0,
      },
      '4A(5)': {
        description: 'All other ITC (from GSTR-2B)',
        amount: Math.round(itcAmount * 100) / 100,
      },
      '4B': { itcReversals: 0 },
      '4C': { netITC: Math.round(itcAmount * 100) / 100 },
      '4D': { ineligibleITC: 0 },
    };

    return {
      periodFrom,
      periodTo,
      table31,
      table4,
      note: 'Basic pre-fill. Configure GST account mapping for accurate GSTR-3B values.',
    };
  }

  /**
   * GST Reconciliation: compares GSTR-2B CSV (uploaded) with ITC booked in journals.
   * Uses GST input accounts (e.g. 1500) on the books side.
   */
  static async gstReconciliation(
    organizationId: OrganizationId,
    params: {
      gstr2bFilePath: string;
      periodFrom: Date;
      periodTo: Date;
      matchOn?: string[];
      toleranceAmount?: number;
      toleranceDateDays?: number;
    }
  ): Promise<GSTReconciliationReport> {
    const {
      gstr2bFilePath,
      periodFrom,
      periodTo,
      matchOn,
      toleranceAmount,
      toleranceDateDays,
    } = params;

    const effectiveMatchOn =
      matchOn && matchOn.length > 0
        ? matchOn
        : ['gstin', 'invoiceNumber', 'invoiceDate', 'taxableValue'];
    void effectiveMatchOn;
    const tolAmount = toleranceAmount ?? 1.0;
    const tolDays = toleranceDateDays ?? 3;

    const gstr2bRows = await parseGstr2bCsv(gstr2bFilePath);
    const booksRows = await getBooksITCRows(
      organizationId,
      periodFrom,
      periodTo
    );

    const gstr2bItcTotal = gstr2bRows.reduce(
      (s, r) => s + (r.igst + r.cgst + r.sgst),
      0
    );
    const booksItcTotal = booksRows.reduce((s, r) => s + r.amount, 0);

    const round = (n: number) => Math.round(n * 100) / 100;

    const matched: GSTReconciliationBucketRow[] = [];
    const amountMismatch: GSTReconciliationBucketRow[] = [];
    const dateMismatch: GSTReconciliationBucketRow[] = [];
    const missingInBooks: GSTReconciliationBucketRow[] = [];
    const missingInGstr2b: GSTReconciliationBucketRow[] = [];

    const usedBooks = new Set<number>();

    for (const row of gstr2bRows) {
      const rowItc = row.igst + row.cgst + row.sgst;

      let bestIdx = -1;
      let bestDiff = Number.POSITIVE_INFINITY;

      for (let i = 0; i < booksRows.length; i++) {
        if (usedBooks.has(i)) continue;
        const b = booksRows[i];
        const diffAmount = Math.abs(b.amount - rowItc);
        if (diffAmount < bestDiff) {
          bestDiff = diffAmount;
          bestIdx = i;
        }
      }

      const baseBucket: GSTReconciliationBucketRow = {
        gstin: row.gstin,
        invoiceNumber: row.invoiceNumber,
        invoiceDate: row.invoiceDate.toISOString().slice(0, 10),
        gstr2b: {
          taxableValue: row.taxableValue,
          cgst: row.cgst,
          sgst: row.sgst,
          igst: row.igst,
        },
      };

      if (bestIdx === -1 || bestDiff > tolAmount) {
        missingInBooks.push(baseBucket);
        continue;
      }

      usedBooks.add(bestIdx);
      const b = booksRows[bestIdx];
      const booksBucketPart = {
        journalReferences: [b.reference ?? b.journalId],
        itcAmount: round(b.amount),
      };

      const dateMatch =
        !b.date ||
        Math.abs(
          (b.date.getTime() - row.invoiceDate.getTime()) / (1000 * 60 * 60 * 24)
        ) <= tolDays;

      if (bestDiff <= tolAmount && dateMatch) {
        matched.push({
          ...baseBucket,
          books: booksBucketPart,
        });
      } else if (!dateMatch && bestDiff <= tolAmount) {
        dateMismatch.push({
          ...baseBucket,
          books: booksBucketPart,
        });
      } else {
        amountMismatch.push({
          ...baseBucket,
          books: booksBucketPart,
        });
      }
    }

    for (let i = 0; i < booksRows.length; i++) {
      if (usedBooks.has(i)) continue;
      const b = booksRows[i];
      missingInGstr2b.push({
        books: {
          journalReferences: [b.reference ?? b.journalId],
          itcAmount: round(b.amount),
        },
      });
    }

    const summary: GSTReconciliationSummary = {
      gstr2bItc: round(gstr2bItcTotal),
      booksItc: round(booksItcTotal),
      difference: round(booksItcTotal - gstr2bItcTotal),
      matchedCount: matched.length,
      missingInBooksCount: missingInBooks.length,
      missingInGstr2bCount: missingInGstr2b.length,
    };

    return {
      period: { from: periodFrom, to: toEndOfDayUTC(periodTo) },
      summary,
      buckets: {
        matched,
        amountMismatch,
        dateMismatch,
        missingInBooks,
        missingInGstr2b,
      },
    };
  }

  /**
   * P&L (Profit & Loss): period report. Config uses account codes; resolved to IDs per org.
   * If config omitted, use getDefaultPnLConfig() (code-based, works for standard COA templates).
   */
  static async getPnL(
    organizationId: OrganizationId,
    periodFrom: Date,
    periodTo: Date,
    config?: PnLConfig
  ): Promise<PnLReport> {
    const effectiveConfig = config ?? getDefaultPnLConfig();
    const usedDefaultConfig = !config;

    const [movements, accountsMap, codeToId] = await Promise.all([
      getPeriodMovements(organizationId, periodFrom, periodTo),
      getAccountsMap(organizationId),
      (async () => {
        const allCodes = new Set<string>();
        for (const section of [
          effectiveConfig.revenue,
          effectiveConfig.cogs,
          effectiveConfig.operatingExpenses,
          effectiveConfig.otherIncome,
          effectiveConfig.otherExpenses,
        ]) {
          for (const item of section ?? []) {
            for (const c of item.accountCodes) allCodes.add(c);
          }
        }
        return resolveAccountCodesToIds(organizationId, Array.from(allCodes));
      })(),
    ]);

    const round = (n: number) => Math.round(n * 100) / 100;

    const getSignedAmount = (accountId: string): number => {
      const delta = movements.get(accountId) ?? 0;
      const acc = accountsMap.get(accountId);
      const type = (acc as { type?: string })?.type;
      if (type === 'INCOME') return -delta;
      if (type === 'EXPENSE') return delta;
      return delta;
    };

    const sumLineItems = (items: PnLLineItem[] | undefined): PnLSection => {
      const lineItems = (items ?? []).map((item) => {
        const accountIds = item.accountCodes
          .map((c) => codeToId.get(c))
          .filter(Boolean) as string[];
        const accountsDetail: { code: string; name: string; amount: number }[] =
          [];
        let amount = 0;
        for (const id of accountIds) {
          const amt = getSignedAmount(id);
          amount += amt;
          const acc = accountsMap.get(id);
          const code = (acc as { code?: string })?.code ?? '';
          const name = (acc as { name?: string })?.name ?? '';
          if (code) accountsDetail.push({ code, name, amount: round(amt) });
        }
        return {
          label: item.label,
          accountCodes: item.accountCodes,
          amount: round(amount),
          accounts: accountsDetail.length ? accountsDetail : undefined,
        };
      });
      const total = lineItems.reduce((s, li) => s + li.amount, 0);
      return { label: '', lineItems, total: round(total) };
    };

    const revenue = sumLineItems(effectiveConfig.revenue);
    revenue.label = 'Revenue';
    const cogs = sumLineItems(effectiveConfig.cogs);
    cogs.label = 'Cost of Goods Sold';
    const operatingExpenses = sumLineItems(effectiveConfig.operatingExpenses);
    operatingExpenses.label = 'Operating Expenses';
    const otherIncome = sumLineItems(effectiveConfig.otherIncome);
    otherIncome.label = 'Other Income';
    const otherExpenses = sumLineItems(effectiveConfig.otherExpenses);
    otherExpenses.label = 'Other Expenses';

    const grossProfit = round(revenue.total - cogs.total);
    const operatingIncome = round(grossProfit - operatingExpenses.total);
    const netIncome = round(
      operatingIncome + otherIncome.total - otherExpenses.total
    );

    return {
      periodFrom,
      periodTo,
      revenue,
      cogs,
      grossProfit,
      operatingExpenses,
      operatingIncome,
      otherIncome,
      otherExpenses,
      netIncome,
      usedDefaultConfig,
    };
  }

  /**
   * Cash Flow: period report. Config uses account codes; resolved to IDs per org.
   * If config omitted, use getDefaultCashFlowConfig() (code-based).
   */
  static async getCashFlow(
    organizationId: OrganizationId,
    periodFrom: Date,
    periodTo: Date,
    config?: CashFlowConfig
  ): Promise<CashFlowReport> {
    const effectiveConfig = config ?? getDefaultCashFlowConfig();
    const usedDefaultConfig = !config;

    const allCodes = new Set<string>();
    for (const section of [
      effectiveConfig.operating,
      effectiveConfig.investing,
      effectiveConfig.financing,
    ]) {
      for (const item of section ?? []) {
        for (const c of item.accountCodes) allCodes.add(c);
      }
    }

    const cashAccountCodes = effectiveConfig.operating?.[0]?.accountCodes ?? [
      '1001',
      '1002',
    ];
    const allCodesWithCash = new Set([...allCodes, ...cashAccountCodes]);

    const [movements, accountsMap, codeToId] = await Promise.all([
      getPeriodMovements(organizationId, periodFrom, periodTo),
      getAccountsMap(organizationId),
      resolveAccountCodesToIds(organizationId, Array.from(allCodesWithCash)),
    ]);

    const cashAccountIds = cashAccountCodes
      .map((c) => codeToId.get(c))
      .filter(Boolean) as string[];
    const round = (n: number) => Math.round(n * 100) / 100;
    const openingCashBalance = round(
      await getBalanceSumAsOfDate(
        organizationId,
        new Date(periodFrom.getTime() - 1),
        cashAccountIds
      )
    );

    const buildSection = (
      items: CashFlowLineItem[] | undefined,
      sectionLabel: string
    ): CashFlowSection => {
      const lineItems = (items ?? []).map((item) => {
        const accountIds = item.accountCodes
          .map((c) => codeToId.get(c))
          .filter(Boolean) as string[];
        const raw = accountIds.reduce(
          (s, id) => s + (movements.get(id) ?? 0),
          0
        );
        const amount = item.sign === 'negative' ? round(-raw) : round(raw);
        const accountsDetail: { code: string; name: string; amount: number }[] =
          [];
        for (const id of accountIds) {
          const amt = movements.get(id) ?? 0;
          const signed = item.sign === 'negative' ? -amt : amt;
          const acc = accountsMap.get(id);
          const code = (acc as { code?: string })?.code ?? '';
          const name = (acc as { name?: string })?.name ?? '';
          if (code) accountsDetail.push({ code, name, amount: round(signed) });
        }
        return {
          label: item.label,
          accountCodes: item.accountCodes,
          amount,
          accounts: accountsDetail.length ? accountsDetail : undefined,
        };
      });
      const total = lineItems.reduce((s, li) => s + li.amount, 0);
      return {
        label: sectionLabel,
        lineItems,
        total: round(total),
      };
    };

    const operating = buildSection(
      effectiveConfig.operating,
      'Operating Activities'
    );
    const investing = buildSection(
      effectiveConfig.investing,
      'Investing Activities'
    );
    const financing = buildSection(
      effectiveConfig.financing,
      'Financing Activities'
    );

    const effectivePeriodTo = toEndOfDayUTC(periodTo);
    const journalItems = await getCashFlowJournalItems(
      organizationId,
      periodFrom,
      effectivePeriodTo,
      cashAccountIds,
      effectiveConfig,
      accountsMap
    );
    operating.items = journalItems.operating;
    investing.items = journalItems.investing;
    financing.items = journalItems.financing;
    const netCashFlow = round(
      operating.total + investing.total + financing.total
    );
    const closingCashBalance = round(openingCashBalance + netCashFlow);

    return {
      period: { from: periodFrom, to: periodTo },
      openingCashBalance,
      operating,
      investing,
      financing,
      netCashFlow,
      closingCashBalance,
      usedDefaultConfig,
    };
  }
}

async function parseGstr2bCsv(filePath: string): Promise<GSTR2BRow[]> {
  const abs = path.resolve(filePath);
  const raw = await fs.promises.readFile(abs, 'utf8');
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length <= 1) return [];

  const header = lines[0].split(',');
  const idx = (name: string) => header.indexOf(name);

  const idxGstin = idx('GSTIN of supplier');
  const idxName = idx('Trade/Legal name');
  const idxInvNo = idx('Invoice number');
  const idxInvType = idx('Invoice type');
  const idxInvDate = idx('Invoice Date');
  const idxInvValue = idx('Invoice Value(₹)');
  const idxPos = idx('Place of supply');
  const idxRev = idx('Supply Attract Reverse Charge');
  const idxTaxable = idx('Taxable Value (₹)');
  const idxIgst = idx('Integrated Tax(₹)');
  const idxCgst = idx('Central Tax(₹)');
  const idxSgst = idx('State/UT Tax(₹)');

  const rows: GSTR2BRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < header.length) continue;

    const num = (v: string | undefined) => {
      if (!v) return 0;
      const n = Number(v.replace(/,/g, ''));
      return Number.isFinite(n) ? n : 0;
    };

    const dateStr = cols[idxInvDate] ?? '';
    const parsedDate = new Date(dateStr);

    rows.push({
      gstin: cols[idxGstin] ?? '',
      tradeName: cols[idxName] ?? '',
      invoiceNumber: cols[idxInvNo] ?? '',
      invoiceType: cols[idxInvType] ?? '',
      invoiceDate: Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate,
      invoiceValue: num(cols[idxInvValue]),
      placeOfSupply: cols[idxPos] ?? '',
      reverseCharge: cols[idxRev] ?? '',
      taxableValue: num(cols[idxTaxable]),
      igst: num(cols[idxIgst]),
      cgst: num(cols[idxCgst]),
      sgst: num(cols[idxSgst]),
    });
  }

  return rows;
}

async function getBooksITCRows(
  organizationId: OrganizationId,
  periodFrom: Date,
  periodTo: Date
): Promise<GSTBooksITCRow[]> {
  const orgObjectId = new Types.ObjectId(organizationId);
  const effectivePeriodTo = toEndOfDayUTC(periodTo);

  const pipeline = [
    {
      $match: {
        organizationId: orgObjectId,
        status: 'POSTED',
        date: { $gte: periodFrom, $lte: effectivePeriodTo },
      },
    },
    { $unwind: '$lines' },
    {
      $lookup: {
        from: 'coas',
        localField: 'lines.accountId',
        foreignField: '_id',
        as: 'account',
      },
    },
    { $unwind: '$account' },
    {
      $match: {
        'account.type': { $in: ['EXPENSE', 'ASSET'] },
        $or: [
          { 'account.name': { $regex: /input|itc|igst|cgst|sgst|gst/i } },
          { 'account.code': '1500' },
        ],
      },
    },
    {
      $project: {
        journalId: '$_id',
        reference: '$reference',
        date: '$date',
        amount: '$lines.debit',
      },
    },
  ];

  type Row = {
    journalId: Types.ObjectId;
    reference?: string;
    date?: Date;
    amount?: number;
  };

  const result = (await JournalEntryModel.aggregate(pipeline)) as Row[];

  return result
    .filter((r) => (r.amount ?? 0) !== 0)
    .map((r) => ({
      journalId: r.journalId.toString(),
      reference: r.reference,
      date: r.date,
      amount: r.amount ?? 0,
    }));
}
