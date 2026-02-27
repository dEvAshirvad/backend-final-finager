import mongoose, { QueryFilter, Types } from 'mongoose';
import fs from 'node:fs';
import {
  JournalEntryModel,
  type JournalEntry,
  type JournalEntryCreate,
  type JournalEntryUpdate,
} from './journal.model';
import type { JournalBulkCreate } from './journal.model';
import { COAModel } from '@/modules/accounting/coa/coa.model';
import APIError from '@/configs/errors/APIError';
import { createPaginationResult, createSortObject } from '@/lib/pagination';

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

type JournalLine = { accountId: string; debit: number; credit: number };

/** Run with transaction; fallback to no transaction if replica set unavailable (standalone MongoDB) */
const TX_ERROR =
  'Transaction numbers are only allowed on a replica set member or mongos';

async function runWithTxFallback<T>(
  fn: (session: mongoose.mongo.ClientSession | null) => Promise<T>
): Promise<T> {
  try {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const result = await fn(session);
      await session.commitTransaction();
      return result;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  } catch (error) {
    const msg = (error as Error)?.message ?? '';
    if (msg.includes(TX_ERROR)) {
      return fn(null);
    }
    throw error;
  }
}

interface AccountingValidationResult {
  isValid: boolean;
  errors: string[];
  balanceSheetBalanced: boolean;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalRevenue: number;
  totalExpenses: number;
}

export default class JournalServices {
  /** Validate accounting rules: account existence, debit/credit by type, balance sheet equation */
  private static async validateAccountingRules(
    lines: JournalLine[],
    organizationId: string
  ): Promise<AccountingValidationResult> {
    try {
      const errors: string[] = [];
      let totalAssets = 0;
      let totalLiabilities = 0;
      let totalEquity = 0;
      let totalRevenue = 0;
      let totalExpenses = 0;

      const accountIds = lines.map((l) => l.accountId);
      const orgObjectId = new Types.ObjectId(organizationId);
      const accounts = await COAModel.find({
        _id: { $in: accountIds.map((id) => new Types.ObjectId(id)) },
        organizationId: orgObjectId,
      } as object).lean();

      const accountMap = new Map(
        accounts.map((a: { _id: Types.ObjectId; [k: string]: unknown }) => [
          a._id.toString(),
          a,
        ])
      );

      const missingIds = accountIds.filter((id) => !accountMap.has(id));
      if (missingIds.length > 0) {
        throw new APIError({
          STATUS: 400,
          TITLE: 'Accounts Not Found',
          MESSAGE: 'Some accounts not found',
          META: { accounts: missingIds },
        });
      }

      // Convert lines to transactions: amount + type (debit | credit)
      for (const line of lines) {
        const amount = line.debit > 0 ? line.debit : line.credit;
        const isDebit = line.debit > 0;

        const account = accountMap.get(line.accountId) as unknown as {
          type: string;
          name: string;
        };
        const accType = account.type?.toLowerCase();

        switch (accType) {
          case 'asset':
            if (isDebit) totalAssets += amount;
            else totalAssets -= amount;
            break;
          case 'liability':
            if (isDebit) totalLiabilities -= amount;
            else totalLiabilities += amount;
            break;
          case 'equity':
            if (isDebit) totalEquity -= amount;
            else totalEquity += amount;
            break;
          case 'income':
            if (isDebit) totalRevenue -= amount;
            else totalRevenue += amount;
            break;
          case 'expense':
            if (isDebit) totalExpenses += amount;
            else totalExpenses -= amount;
            break;
          default:
            errors.push(`Unknown account type: ${account.type}`);
        }
      }

      // Balance sheet: Assets = Liabilities + Equity + (Revenue - Expenses)
      const netIncome = totalRevenue - totalExpenses;
      const adjustedEquity = totalEquity + netIncome;
      const balanceSheetBalanced =
        Math.abs(totalAssets - (totalLiabilities + adjustedEquity)) < 0.01;

      if (!balanceSheetBalanced) {
        errors.push(
          `Balance sheet does not balance. Assets (${totalAssets.toFixed(2)}) ≠ Liabilities + Equity (${(totalLiabilities + adjustedEquity).toFixed(2)})`
        );
      }

      // Validate no negative amounts per line (Zod already enforces min 0, but double-check)
      for (const line of lines) {
        const account = accountMap.get(line.accountId) as unknown as {
          type: string;
          name: string;
        };
        const amount = line.debit > 0 ? line.debit : line.credit;
        const isDebit = line.debit > 0;

        if (amount < 0) {
          errors.push(
            `${account.type} account ${account.name} cannot have negative ${isDebit ? 'debit' : 'credit'} amount`
          );
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        balanceSheetBalanced,
        totalAssets,
        totalLiabilities,
        totalEquity,
        totalRevenue,
        totalExpenses,
      };
    } catch (error) {
      throw error;
    }
  }

  static async createJournalEntry(
    data: JournalEntryCreate & {
      organizationId: string;
      userId?: string;
      role?: string;
    }
  ): Promise<JournalEntry> {
    const { organizationId, userId, role, lines, ...rest } = data;
    const orgObjectId = new Types.ObjectId(organizationId);
    const isFullAccess = role === 'ca' || role === 'owner';
    const status = isFullAccess ? 'POSTED' : 'DRAFT';

    const validation = await this.validateAccountingRules(
      lines,
      organizationId
    );

    if (!validation.isValid) {
      throw new APIError({
        STATUS: 400,
        TITLE: 'Accounting Validation Failed',
        MESSAGE: validation.errors.join('; '),
      });
    }

    return runWithTxFallback(async (session) => {
      const opts = session ? { session } : {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const created = await (JournalEntryModel.create as any)(
        [
          {
            ...rest,
            organizationId: orgObjectId,
            lines: lines.map((l) => ({
              ...l,
              accountId: new Types.ObjectId(l.accountId),
            })),
            status,
            createdBy: userId ? new Types.ObjectId(userId) : undefined,
            updatedBy: userId ? new Types.ObjectId(userId) : undefined,
          },
        ],
        opts
      );
      const journalEntry = (Array.isArray(created) ? created[0] : created) as {
        toObject: () => JournalEntry;
        _id: Types.ObjectId;
      };

      for (const line of lines) {
        const delta = line.debit - line.credit;
        await COAModel.findByIdAndUpdate(
          line.accountId,
          { $inc: { currentBalance: delta } },
          opts
        );
      }

      return {
        ...(journalEntry.toObject() as JournalEntry),
        journalId: journalEntry._id.toString(),
        accountingValidation: validation,
      } as JournalEntry & {
        journalId: string;
        accountingValidation: AccountingValidationResult;
      };
    });
  }

  /** Create many journal entries. Validates all first; creates all or none. */
  static async createManyJournalEntries(
    entries: JournalBulkCreate,
    context: {
      organizationId: string;
      userId?: string;
      role?: string;
    }
  ): Promise<
    (JournalEntry & {
      journalId: string;
      accountingValidation: AccountingValidationResult;
    })[]
  > {
    const { organizationId, userId, role } = context;
    const orgObjectId = new Types.ObjectId(organizationId);
    const isFullAccess = role === 'ca' || role === 'owner';
    const status = isFullAccess ? 'POSTED' : 'DRAFT';

    const validations: AccountingValidationResult[] = [];
    const failures: { index: number; reference: string; errors: string[] }[] =
      [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      try {
        const v = await this.validateAccountingRules(
          entry.lines,
          organizationId
        );
        validations.push(v);
        if (!v.isValid) {
          failures.push({
            index: i,
            reference: entry.reference,
            errors: v.errors,
          });
        }
      } catch (err) {
        const msg =
          err instanceof APIError
            ? err.message
            : ((err as Error)?.message ?? '');
        failures.push({
          index: i,
          reference: entry.reference,
          errors: [msg],
        });
      }
    }

    if (failures.length > 0) {
      throw new APIError({
        STATUS: 400,
        TITLE: 'Bulk Validation Failed',
        MESSAGE: `${failures.length} of ${entries.length} entries failed validation`,
        META: { failures },
      });
    }

    return runWithTxFallback(async (session) => {
      const opts = session ? { session } : {};
      const created: (JournalEntry & {
        journalId: string;
        accountingValidation: AccountingValidationResult;
      })[] = [];

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const { lines, ...rest } = entry;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const docs = await (JournalEntryModel.create as any)(
          [
            {
              ...rest,
              organizationId: orgObjectId,
              lines: lines.map((l) => ({
                ...l,
                accountId: new Types.ObjectId(l.accountId),
              })),
              status,
              createdBy: userId ? new Types.ObjectId(userId) : undefined,
              updatedBy: userId ? new Types.ObjectId(userId) : undefined,
            },
          ],
          opts
        );
        const doc = (Array.isArray(docs) ? docs[0] : docs) as {
          toObject: () => JournalEntry;
          _id: Types.ObjectId;
        };

        for (const line of lines) {
          const delta = line.debit - line.credit;
          await COAModel.findByIdAndUpdate(
            line.accountId,
            { $inc: { currentBalance: delta } },
            opts
          );
        }

        created.push({
          ...(doc.toObject() as JournalEntry),
          journalId: doc._id.toString(),
          accountingValidation: validations[i],
        } as JournalEntry & {
          journalId: string;
          accountingValidation: AccountingValidationResult;
        });
      }

      return created;
    });
  }

  static async listJournalEntries({
    query,
    organizationId,
    userId,
    role,
    page,
    limit,
    sort,
    order,
  }: {
    query: {
      reference?: string;
      dateFrom?: Date;
      dateTo?: Date;
      description?: string;
      status?: string;
      createdBy?: string;
      updatedBy?: string;
      createdAt?: Date;
      updatedAt?: Date;
    };
    organizationId: string;
    userId: string;
    role: string;
    page: number;
    limit: number;
    sort: string;
    order: 'asc' | 'desc' | '1' | '-1';
  }) {
    try {
      // Create Query based on role
      const queryBuilder: QueryFilter<JournalEntry> = {};
      if (query.reference)
        queryBuilder.reference = {
          $regex: query.reference,
          $options: 'i',
        } as unknown as string;
      if (query.dateFrom) queryBuilder.date = { $gte: query.dateFrom };
      if (query.dateTo) queryBuilder.date = { $lte: query.dateTo };
      if (query.description)
        queryBuilder.description = {
          $regex: query.description,
          $options: 'i',
        } as unknown as string;
      if (query.status) queryBuilder.status = query.status;
      if (query.createdBy) queryBuilder.createdBy = query.createdBy;
      if (query.updatedBy) queryBuilder.updatedBy = query.updatedBy;
      if (query.createdAt)
        queryBuilder.createdAt = {
          $gte: new Date(query.createdAt as unknown as string),
        };
      if (query.updatedAt)
        queryBuilder.updatedAt = {
          $lte: new Date(query.updatedAt as unknown as string),
        };

      const sortObject = createSortObject(sort, order) || {
        createdAt: -1,
        date: -1,
      };

      const baseFilter = {
        organizationId: new Types.ObjectId(organizationId),
        ...queryBuilder,
      };

      // Staff may only see entries they created/updated or that are POSTED; apply in query so count matches data
      const filter: Record<string, unknown> =
        role === 'ca' || role === 'owner'
          ? baseFilter
          : {
              ...baseFilter,
              $or: [
                { createdBy: new Types.ObjectId(userId) },
                { updatedBy: new Types.ObjectId(userId) },
                { status: 'POSTED' },
              ],
            };

      const [data, total] = await Promise.all([
        JournalEntryModel.find(filter)
          .sort(sortObject)
          .skip((page - 1) * limit)
          .limit(limit)
          .lean()
          .exec(),
        JournalEntryModel.countDocuments(filter).exec(),
      ]);

      return createPaginationResult(data as JournalEntry[], total, page, limit);
    } catch (error) {
      throw error;
    }
  }

  static async getJournalEntryById({
    id,
    organizationId,
    userId,
    role,
  }: {
    id: string;
    organizationId: string;
    userId: string;
    role: string;
  }) {
    try {
      const doc = await JournalEntryModel.findOne({
        _id: new Types.ObjectId(id),
        organizationId,
        ...(role === 'ca' || role === 'owner'
          ? {}
          : {
              $or: [
                { createdBy: userId },
                { updatedBy: userId },
                { status: 'POSTED' },
              ],
            }),
      }).lean();
      return doc;
    } catch (error) {
      throw error;
    }
  }

  static async updateJournalEntry({
    id,
    data,
    userId,
    organizationId,
    role,
  }: {
    id: string;
    data: JournalEntryUpdate;
    userId: string;
    organizationId: string;
    role: string;
  }) {
    try {
      if (!Types.ObjectId.isValid(id)) return null;
      if (data.lines) {
        const validation = await this.validateAccountingRules(
          data.lines,
          organizationId
        );
        if (!validation.isValid) {
          throw new APIError({
            STATUS: 400,
            TITLE: 'Accounting Validation Failed',
            MESSAGE: validation.errors.join('; '),
          });
        }
      }
      const update: Record<string, unknown> = {
        updatedBy: new Types.ObjectId(userId),
      };
      if (data.date) update.date = data.date;
      if (data.reference) update.reference = data.reference;
      if (data.description !== undefined) update.description = data.description;
      if (data.lines) {
        update.lines = data.lines.map((l) => ({
          ...l,
          accountId: new Types.ObjectId(l.accountId),
        }));
      }

      const filter = {
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
        status: { $ne: 'POSTED' },
        ...(role === 'ca' || role === 'owner'
          ? {}
          : { $or: [{ createdBy: userId }, { updatedBy: userId }] }),
      } as Record<string, unknown>;

      // console.log('filter', filter);
      // console.log('update', update);
      const doc = await JournalEntryModel.findOneAndUpdate(
        filter,
        {
          $set: {
            ...update,
            status: 'DRAFT',
          },
        },
        { returnDocument: 'after' }
      ).lean();
      return doc;
    } catch (error) {
      throw error;
    }
  }

  static async deleteJournalEntry({
    id,
    userId,
    organizationId,
    role,
  }: {
    id: string;
    userId: string;
    organizationId: string;
    role: string;
  }) {
    try {
      const filter = {
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
        ...(role === 'ca' || role === 'owner'
          ? {}
          : { $or: [{ createdBy: userId }, { updatedBy: userId }] }),
        status: { $ne: 'POSTED' },
      } as Record<string, unknown>;
      const result = await JournalEntryModel.findOneAndDelete(filter).lean();
      return Boolean(result);
    } catch (error) {
      throw error;
    }
  }

  /** Post DRAFT journal: update balances, set POSTED. Owner/CA only. */
  static async postJournalEntry({
    id,
    userId,
    organizationId,
    role,
  }: {
    id: string;
    userId: string;
    organizationId: string;
    role: string;
  }) {
    const result = await this.postManyJournalEntries({
      ids: [id],
      userId,
      organizationId,
      role,
    });
    return result.posted[0] ?? null;
  }

  /** Post multiple DRAFT journals at once. Owner/CA only. */
  static async postManyJournalEntries({
    ids,
    userId,
    organizationId,
    role,
  }: {
    ids: string[];
    userId: string;
    organizationId: string;
    role: string;
  }) {
    if (role !== 'ca' && role !== 'owner') {
      throw new APIError({
        STATUS: 403,
        TITLE: 'Forbidden',
        MESSAGE: 'Only owner or ca can post journal entries',
      });
    }
    if (!ids.length) return { posted: [], failed: [] };

    const validIds = ids.filter((id) => Types.ObjectId.isValid(id));
    const docs = await JournalEntryModel.find({
      _id: { $in: validIds.map((id) => new Types.ObjectId(id)) },
      organizationId: new Types.ObjectId(organizationId),
      status: 'DRAFT',
    } as object).lean();

    return runWithTxFallback(async (session) => {
      const opts = session ? { session } : {};
      const posted: JournalEntry[] = [];
      for (const doc of docs) {
        if (!doc?.lines) continue;
        for (const line of doc.lines) {
          const delta = (line.debit || 0) - (line.credit || 0);
          await COAModel.findByIdAndUpdate(
            line.accountId,
            { $inc: { currentBalance: delta } },
            opts
          );
        }
        const updated = await JournalEntryModel.findByIdAndUpdate(
          doc._id,
          {
            $set: {
              status: 'POSTED',
              updatedBy: new Types.ObjectId(userId),
            },
          },
          { returnDocument: 'after', ...opts }
        ).lean();
        if (updated) posted.push(updated as JournalEntry);
      }
      const postedIds = new Set(posted.map((p) => p.id));
      const failed = validIds.filter((id) => !postedIds.has(id));
      return { posted, failed };
    });
  }

  /** Reverse POSTED journal: reverse balances, set REVERSED. Owner/CA only. */
  static async reverseJournalEntry({
    id,
    userId,
    organizationId,
    role,
  }: {
    id: string;
    userId: string;
    organizationId: string;
    role: string;
  }) {
    const result = await this.reverseManyJournalEntries({
      ids: [id],
      userId,
      organizationId,
      role,
    });
    return result.reversed[0] ?? null;
  }

  /** Reverse multiple POSTED journals at once. Owner/CA only. */
  static async reverseManyJournalEntries({
    ids,
    userId,
    organizationId,
    role,
  }: {
    ids: string[];
    userId: string;
    organizationId: string;
    role: string;
  }) {
    if (role !== 'ca' && role !== 'owner') {
      throw new APIError({
        STATUS: 403,
        TITLE: 'Forbidden',
        MESSAGE: 'Only owner or ca can reverse journal entries',
      });
    }
    if (!ids.length) return { reversed: [], failed: [] };

    const validIds = ids.filter((id) => Types.ObjectId.isValid(id));
    const docs = await JournalEntryModel.find({
      _id: { $in: validIds.map((id) => new Types.ObjectId(id)) },
      organizationId: new Types.ObjectId(organizationId),
      status: 'POSTED',
    } as object).lean();

    return runWithTxFallback(async (session) => {
      const opts = session ? { session } : {};
      const reversed: JournalEntry[] = [];
      for (const doc of docs) {
        if (!doc?.lines) continue;
        for (const line of doc.lines) {
          const delta = (line.credit || 0) - (line.debit || 0);
          await COAModel.findByIdAndUpdate(
            line.accountId,
            { $inc: { currentBalance: delta } },
            opts
          );
        }
        const updated = await JournalEntryModel.findByIdAndUpdate(
          doc._id,
          {
            $set: {
              status: 'REVERSED',
              updatedBy: new Types.ObjectId(userId),
            },
          },
          { returnDocument: 'after', ...opts }
        ).lean();
        if (updated) reversed.push(updated as JournalEntry);
      }
      const reversedIds = new Set(reversed.map((r) => r.id));
      const failed = validIds.filter((id) => !reversedIds.has(id));
      return { reversed, failed };
    });
  }

  static async validateJournelTransactions(
    transactions: JournalLine[],
    organizationId: string
  ) {
    try {
      const validation = await this.validateAccountingRules(
        transactions,
        organizationId
      );
      return validation;
    } catch (error) {
      throw error;
    }
  }

  /** CSV template for journal import: one row per line; use account code (not accountId). */
  static getJournalTemplateCsvBuffer(): Buffer {
    const headers = [
      'date',
      'reference',
      'description',
      'accountCode',
      'debit',
      'credit',
      'narration',
    ];
    const example1 = [
      '2026-02-12',
      'JV-001',
      'Capital contribution',
      '1001',
      '10000',
      '0',
      'Cash received',
    ];
    const example2 = [
      '2026-02-12',
      'JV-001',
      'Capital contribution',
      '2001',
      '0',
      '10000',
      'Capital contribution',
    ];
    const lines = [
      headers.join(','),
      example1.join(','),
      example2.join(','),
    ];
    return Buffer.from(lines.join('\n'), 'utf-8');
  }

  static parseJournalCsvFile(filePath: string): Record<string, string>[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = parseCsvLine(lines[0]!);
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]!);
      const obj: Record<string, string> = {};
      headers.forEach((h, j) => {
        obj[h] = String(values[j] ?? '').trim();
      });
      rows.push(obj);
    }
    return rows;
  }

  /**
   * Import journal entries from CSV. CSV has one row per line; use accountCode (COA code), not accountId.
   * Rows with same date+reference form one entry (min 2 lines per entry). Resolves accountCode to accountId per org.
   */
  static async importFromCsv(
    filePath: string,
    context: {
      organizationId: string;
      userId?: string;
      role?: string;
    }
  ): Promise<{
    created: (JournalEntry & { journalId: string })[];
    count: number;
    errors: { row: number; reference: string; message: string }[];
  }> {
    const { organizationId, userId, role } = context;
    const orgObjectId = new Types.ObjectId(organizationId);
    const rows = this.parseJournalCsvFile(filePath);
    const errors: { row: number; reference: string; message: string }[] = [];

    // Group rows by (date, reference) -> lines[]
    const entryMap = new Map<
      string,
      { date: string; reference: string; description: string; lines: { accountCode: string; debit: number; credit: number; narration?: string }[] }
    >();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const date = r.date ?? r.Date ?? '';
      const reference = r.reference ?? '';
      const accountCode = (r.accountCode ?? r.account_code ?? '').trim();
      const debit = Number(r.debit ?? 0) || 0;
      const credit = Number(r.credit ?? 0) || 0;
      const narration = (r.narration ?? '').trim() || undefined;
      const description = (r.description ?? '').trim() || '';

      if (!date || !reference || !accountCode) {
        errors.push({
          row: i + 2,
          reference: reference || '(blank)',
          message: 'date, reference, and accountCode are required',
        });
        continue;
      }
      const key = `${date}|${reference}`;
      if (!entryMap.has(key)) {
        entryMap.set(key, { date, reference, description, lines: [] });
      }
      const entry = entryMap.get(key)!;
      entry.lines.push({ accountCode, debit, credit, narration });
    }

    // Resolve accountCode -> accountId for org
    const allCodes = new Set<string>();
    for (const e of entryMap.values()) {
      for (const l of e.lines) allCodes.add(l.accountCode);
    }
    const accounts = await (COAModel as any)
      .find({
        organizationId: orgObjectId,
        code: { $in: Array.from(allCodes) },
      })
      .lean()
      .exec();
    const codeToId = new Map(
      accounts.map((a: { code: string; _id: Types.ObjectId }) => [
        a.code,
        a._id.toString(),
      ])
    );

    const entriesToCreate: JournalEntryCreate[] = [];
    for (const e of entryMap.values()) {
      if (e.lines.length < 2) {
        errors.push({
          row: -1,
          reference: e.reference,
          message: 'Each entry must have at least 2 lines (same date+reference)',
        });
        continue;
      }
      const missing = e.lines.filter((l) => !codeToId.has(l.accountCode));
      if (missing.length) {
        errors.push({
          row: -1,
          reference: e.reference,
          message: `Unknown accountCode(s): ${missing.map((m) => m.accountCode).join(', ')}`,
        });
        continue;
      }
      const lines = e.lines.map((l) => ({
        accountId: String(codeToId.get(l.accountCode)),
        debit: l.debit,
        credit: l.credit,
        narration: l.narration,
      }));
      const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
      if (Math.abs(totalDebit - totalCredit) >= 0.01) {
        errors.push({
          row: -1,
          reference: e.reference,
          message: `Debits (${totalDebit}) must equal credits (${totalCredit})`,
        });
        continue;
      }
      entriesToCreate.push({
        date: new Date(e.date),
        reference: e.reference,
        description: e.description || undefined,
        lines,
      });
    }

    if (errors.length > 0 && entriesToCreate.length === 0) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {
        /* ignore */
      }
      throw new APIError({
        STATUS: 400,
        TITLE: 'Journal CSV Import Failed',
        MESSAGE: 'All rows had errors',
        META: { errors },
      });
    }

    let created: (JournalEntry & { journalId: string })[] = [];
    if (entriesToCreate.length > 0) {
      created = (await this.createManyJournalEntries(entriesToCreate, {
        organizationId,
        userId,
        role,
      })) as (JournalEntry & { journalId: string })[];
    }

    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      /* ignore */
    }

    return { created, count: created.length, errors };
  }
}
