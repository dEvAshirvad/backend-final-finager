import { Types } from 'mongoose';
import fs from 'node:fs';
import ExpenseModel from './expenses.model';
import type { Expense } from './expenses.model';
import { createPaginationResult, type PaginationResult } from '@/lib/pagination';
import DispatcherService from '@/modules/accounting/events/dispatcher.service';
import ProductServices from '@/modules/business/products/products.services';

function csvEscape(val: string): string {
  const s = String(val ?? '');
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  result.push(cur.trim());
  return result;
}

function sumExpenseItems(items: Array<{ amount: number }>): number {
  return items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
}

export default class ExpensesServices {
  static async create(
    data: Record<string, any>,
    organizationId: string,
    userId?: string
  ): Promise<Expense & { _id: any }> {
    const orgId = new Types.ObjectId(organizationId);
    const rawItems = Array.isArray(data.items) ? data.items : [];
    const items = rawItems.map((it: any) => ({
      description: it.description ?? undefined,
      amount: Number(it.amount) || 0,
      category: it.category ?? undefined,
    }));
    const totalFromItems = sumExpenseItems(items);
    const rawTotalAmount = Number(data.totalAmount);
    const isInventoryItem = Boolean(data.isInventoryItem);
    const rawInventoryItems = Array.isArray(data.inventoryItems)
      ? data.inventoryItems
      : [];
    const inventoryItems = rawInventoryItems
      .map((it: any) => ({
        productId: it.productId,
        qty: Number(it.qty) || 0,
        costPerUnit: Number(it.costPerUnit) || 0,
        skuCombo: it.skuCombo ?? undefined,
      }))
      .filter((it) => it.productId && it.qty > 0);
    const inventoryTotal = inventoryItems.reduce(
      (sum, it) => sum + it.qty * it.costPerUnit,
      0
    );

    let totalAmount =
      !Number.isNaN(rawTotalAmount) && rawTotalAmount > 0
        ? rawTotalAmount
        : items.length > 0
          ? totalFromItems
          : inventoryTotal;
    if (totalAmount <= 0 && items.length === 0 && inventoryTotal <= 0) {
      throw new Error(
        'totalAmount, at least one item with amount, or inventoryItems with qty * costPerUnit is required'
      );
    }

    const doc = await ExpenseModel.create({
      type: 'EXPENSE',
      organizationId: orgId,
      reference: String(data.reference).trim(),
      date: data.date ? new Date(data.date) : new Date(),
      contactId: new Types.ObjectId(data.contactId),
      totalAmount,
      taxableAmount: data.taxableAmount ?? totalAmount,
      gstAmount: data.gstAmount ?? 0,
      status: data.status ?? 'DRAFT',
      placeOfSupply: data.placeOfSupply ?? undefined,
      paymentDue: data.paymentDue ? new Date(data.paymentDue) : undefined,
      narration: data.narration ?? undefined,
      createdBy: userId ? new Types.ObjectId(userId) : undefined,
      updatedBy: userId ? new Types.ObjectId(userId) : undefined,
      category: data.category ?? undefined,
      expenseType: data.expenseType ?? undefined,
      paymentMode: data.paymentMode ?? 'CREDIT',
      items: items.length ? items : undefined,
      receiptRef: data.receiptRef ?? undefined,
      attachmentUrl: data.attachmentUrl ?? undefined,
      isInventoryItem: isInventoryItem || inventoryItems.length > 0,
      inventoryItems: inventoryItems.length
        ? inventoryItems.map((it) => ({
            productId: new Types.ObjectId(it.productId),
            qty: it.qty,
            costPerUnit: it.costPerUnit,
            skuCombo: it.skuCombo,
          }))
        : undefined,
    } as any);

    return doc.toObject() as unknown as Expense & { _id: any };
  }

  static async list(
    filters: {
      status?: string;
      contactId?: string;
      category?: string;
      from?: string;
      to?: string;
      paymentDueBy?: string;
    },
    sort: Record<string, 1 | -1>,
    organizationId: string,
    page: number,
    limit: number
  ): Promise<PaginationResult<Expense & { _id: any }>> {
    const q: any = { organizationId: new Types.ObjectId(organizationId), type: 'EXPENSE' };
    if (filters.status) q.status = filters.status;
    if (filters.contactId) q.contactId = new Types.ObjectId(filters.contactId);
    if (filters.category) q.category = filters.category;
    if (filters.from || filters.to) {
      q.date = {};
      if (filters.from) q.date.$gte = new Date(filters.from);
      if (filters.to) q.date.$lte = new Date(filters.to);
    }
    if (filters.paymentDueBy) q.paymentDue = { $lte: new Date(filters.paymentDueBy) };

    const [data, total] = await Promise.all([
      ExpenseModel.find(q).sort(sort).skip((page - 1) * limit).limit(limit).lean().exec(),
      ExpenseModel.countDocuments(q).exec(),
    ]);

    return createPaginationResult(
      data as unknown as (Expense & { _id: any })[],
      total,
      page,
      limit
    );
  }

  static async getById(id: string, organizationId: string): Promise<(Expense & { _id: any }) | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await ExpenseModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
      type: 'EXPENSE',
    })
      .lean()
      .exec();
    return doc as (Expense & { _id: any }) | null;
  }

  static async update(
    id: string,
    data: Record<string, any>,
    organizationId: string,
    userId?: string
  ): Promise<(Expense & { _id: any }) | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const existing = await ExpenseModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
      type: 'EXPENSE',
    }).exec();
    if (!existing || (existing as any).status !== 'DRAFT') return null;

    const update: any = {};
    if (data.reference !== undefined) update.reference = String(data.reference).trim();
    if (data.date !== undefined) update.date = new Date(data.date);
    if (data.contactId !== undefined) update.contactId = new Types.ObjectId(data.contactId);
    if (data.totalAmount !== undefined) update.totalAmount = Number(data.totalAmount);
    if (data.placeOfSupply !== undefined) update.placeOfSupply = data.placeOfSupply;
    if (data.paymentDue !== undefined) update.paymentDue = data.paymentDue ? new Date(data.paymentDue) : null;
    if (data.narration !== undefined) update.narration = data.narration;
    if (data.category !== undefined) update.category = data.category;
    if (data.expenseType !== undefined) update.expenseType = data.expenseType;
    if (data.paymentMode !== undefined) update.paymentMode = data.paymentMode;
    if (data.receiptRef !== undefined) update.receiptRef = data.receiptRef;
    if (data.attachmentUrl !== undefined) update.attachmentUrl = data.attachmentUrl;
    if (data.isInventoryItem !== undefined)
      update.isInventoryItem = Boolean(data.isInventoryItem);
    if (userId) update.updatedBy = new Types.ObjectId(userId);

    if (Array.isArray(data.items)) {
      const items = data.items.map((it: any) => ({
        description: it.description ?? undefined,
        amount: Number(it.amount) || 0,
        category: it.category ?? undefined,
      }));
      update.items = items;
      const sum = sumExpenseItems(items);
      if (items.length) update.totalAmount = sum;
    }

    if (Array.isArray(data.inventoryItems)) {
      const inventoryItems = data.inventoryItems
        .map((it: any) => ({
          productId: it.productId,
          qty: Number(it.qty) || 0,
          costPerUnit: Number(it.costPerUnit) || 0,
          skuCombo: it.skuCombo ?? undefined,
        }))
        .filter((it) => it.productId && it.qty > 0);
      update.inventoryItems = inventoryItems.length
        ? inventoryItems.map((it) => ({
            productId: new Types.ObjectId(it.productId),
            qty: it.qty,
            costPerUnit: it.costPerUnit,
            skuCombo: it.skuCombo,
          }))
        : [];
    }

    const doc = await ExpenseModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) },
      { $set: update },
      { new: true, runValidators: true }
    )
      .lean()
      .exec();
    return doc as (Expense & { _id: any }) | null;
  }

  static async remove(id: string, organizationId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const existing = await ExpenseModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
      type: 'EXPENSE',
    }).lean().exec();
    if (!existing || (existing as any).status !== 'DRAFT') return false;
    const res = await ExpenseModel.deleteOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    }).exec();
    return res.deletedCount === 1;
  }

  static getTemplateCsvBuffer(): Buffer {
    const headers = [
      'reference',
      'date',
      'contactId',
      'paymentMode',
      'category',
      'expenseType',
      'items',
      'isInventoryItem',
      'inventoryItems',
      'receiptRef',
      'narration',
    ];
    const itemsExample = '[{"description":"Office supplies","amount":500,"category":"OFFICE"}]';
    const inventoryItemsExample =
      '[{"productId":"<productId>","qty":10,"costPerUnit":150,"skuCombo":"orange-M"}]';
    const exampleRow = [
      csvEscape('EXP-000001'),
      csvEscape(new Date().toISOString().split('T')[0]!),
      csvEscape(''),
      csvEscape('CREDIT'),
      csvEscape('OFFICE'),
      csvEscape(''),
      csvEscape(itemsExample),
      csvEscape('false'),
      csvEscape(inventoryItemsExample),
      csvEscape(''),
      csvEscape(''),
    ];
    const lines = [headers.join(','), exampleRow.join(',')];
    return Buffer.from(lines.join('\n'), 'utf-8');
  }

  static parseCsvFile(filePath: string): Record<string, string>[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = parseCsvLine(lines[0]!);
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]!);
      const row: Record<string, string> = {};
      headers.forEach((h, j) => {
        row[h] = values[j] ?? '';
      });
      rows.push(row);
    }
    return rows;
  }

  static async bulkImportFromCsv(
    filePath: string,
    organizationId: string,
    userId?: string
  ): Promise<{
    hit: number;
    created: number;
    updated: number;
    errors: { row: number; field?: string; reason: string }[];
    imported: any[];
  }> {
    const rows = this.parseCsvFile(filePath);
    const created: any[] = [];
    const errors: { row: number; field?: string; reason: string }[] = [];
    const orgId = new Types.ObjectId(organizationId);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const rowNum = i + 2;

      const reference = String(row.reference ?? '').trim();
      if (!reference) {
        errors.push({ row: rowNum, field: 'reference', reason: 'reference is required' });
        continue;
      }

      const contactId = String(row.contactId ?? '').trim();
      if (!contactId || !Types.ObjectId.isValid(contactId)) {
        errors.push({ row: rowNum, field: 'contactId', reason: 'valid contactId required' });
        continue;
      }

      let items: any[] = [];
      const itemsStr = String(row.items ?? '[]').trim();
      if (itemsStr) {
        try {
          items = JSON.parse(itemsStr);
          if (!Array.isArray(items)) items = [];
        } catch {
          errors.push({ row: rowNum, field: 'items', reason: 'items must be a JSON array' });
          continue;
        }
      }

      const isInventoryItem =
        String(row.isInventoryItem ?? '').trim().toLowerCase() === 'true';
      let inventoryItems: any[] = [];
      const inventoryItemsStr = String(row.inventoryItems ?? '').trim();
      if (inventoryItemsStr) {
        try {
          inventoryItems = JSON.parse(inventoryItemsStr);
          if (!Array.isArray(inventoryItems)) inventoryItems = [];
        } catch {
          errors.push({
            row: rowNum,
            field: 'inventoryItems',
            reason: 'inventoryItems must be a JSON array',
          });
          continue;
        }
      }

      const inventoryTotal = inventoryItems.reduce(
        (sum, it) =>
          sum +
          (Number(it.qty) || 0) * (Number(it.costPerUnit) || 0),
        0
      );
      const totalAmount = items.length
        ? sumExpenseItems(items)
        : inventoryTotal || Number(row.totalAmount) || 0;
      if (totalAmount <= 0 && !items.length && !inventoryItems.length) {
        errors.push({
          row: rowNum,
          reason:
            'totalAmount, items, or inventoryItems with qty*costPerUnit required',
        });
        continue;
      }

      const existing = await ExpenseModel.findOne({
        organizationId: orgId,
        type: 'EXPENSE',
        reference,
      }).exec();
      if (existing) {
        errors.push({ row: rowNum, reason: 'reference already exists' });
        continue;
      }

      try {
        const doc = await ExpenseModel.create({
          type: 'EXPENSE',
          organizationId: orgId,
          reference,
          date: row.date ? new Date(row.date) : new Date(),
          contactId: new Types.ObjectId(contactId),
          totalAmount: items.length ? sumExpenseItems(items) : totalAmount,
          status: 'DRAFT',
          category: row.category?.trim() || undefined,
          expenseType: row.expenseType?.trim() || undefined,
          paymentMode: row.paymentMode?.trim() || 'CREDIT',
          items: items.length ? items.map((it: any) => ({ description: it.description, amount: Number(it.amount) || 0, category: it.category })) : undefined,
          receiptRef: row.receiptRef?.trim() || undefined,
          narration: row.narration?.trim() || undefined,
          isInventoryItem: isInventoryItem || inventoryItems.length > 0,
          inventoryItems: inventoryItems.length
            ? inventoryItems.map((it: any) => ({
                productId: Types.ObjectId.isValid(it.productId)
                  ? new Types.ObjectId(it.productId)
                  : undefined,
                qty: Number(it.qty) || 0,
                costPerUnit: Number(it.costPerUnit) || 0,
                skuCombo: it.skuCombo ?? undefined,
              }))
            : undefined,
          createdBy: userId ? new Types.ObjectId(userId) : undefined,
        } as any);
        created.push(doc.toObject());
      } catch (err) {
        errors.push({ row: rowNum, reason: (err as Error).message });
      }
    }

    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      /* ignore */
    }

    return {
      hit: created.length,
      created: created.length,
      updated: 0,
      errors,
      imported: created,
    };
  }

  /** Post expense: dispatch journal event, set status POSTED and journalId. */
  static async post(
    id: string,
    organizationId: string,
    userId?: string,
    orchid?: string,
    role?: string
  ): Promise<{
    expense: (Expense & { _id: any }) | null;
    results?: any[];
    stockAdjustFailures?: { productId: string; qty: number; reason: string }[];
  }> {
    if (!Types.ObjectId.isValid(id)) return { expense: null };
    const expense = await ExpenseModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
      type: 'EXPENSE',
      status: 'DRAFT',
    })
      .lean()
      .exec();
    if (!expense) return { expense: null };

    const stockAdjustFailures: {
      productId: string;
      qty: number;
      reason: string;
    }[] = [];

    if ((expense as any).isInventoryItem && Array.isArray((expense as any).inventoryItems)) {
      for (const inv of (expense as any).inventoryItems as any[]) {
        const productId =
          (inv.productId as any)?.toString?.() ?? String(inv.productId ?? '');
        if (!productId || !Types.ObjectId.isValid(productId)) {
          stockAdjustFailures.push({
            productId,
            qty: Number(inv.qty) || 0,
            reason: 'Invalid productId',
          });
          continue;
        }
        const qty = Number(inv.qty) || 0;
        if (qty <= 0) continue;
        const costPerUnit = Number(inv.costPerUnit) || 0;
        const variant = inv.skuCombo ?? undefined;
        try {
          await ProductServices.adjustStock(
            productId,
            organizationId,
            userId,
            {
              type: 'STOCK_IN',
              variant,
              qty,
              costPrice: costPerUnit,
            }
          );
        } catch (err) {
          stockAdjustFailures.push({
            productId,
            qty,
            reason: (err as Error).message,
          });
        }
      }
    }

    const explicitOrchid =
      orchid &&
      /^EXPENSE_(CASH|ONLINE|CREDIT|INVENTORY_CASH|INVENTORY_ONLINE|INVENTORY_CREDIT)$/i.test(
        orchid
      )
        ? orchid.toUpperCase()
        : null;
    const isInventory = Boolean((expense as any).isInventoryItem);
    const defaultOrchid = isInventory
      ? `EXPENSE_INVENTORY_${String(
          (expense as any).paymentMode ?? 'CREDIT'
        ).toUpperCase()}`
      : `EXPENSE_${String(
          (expense as any).paymentMode ?? 'CREDIT'
        ).toUpperCase()}`;
    const resolvedOrchid = explicitOrchid ?? defaultOrchid;

    const payload = {
      reference: (expense as any).reference,
      date:
        (expense as any).date instanceof Date
          ? (expense as any).date.toISOString().slice(0, 10)
          : String((expense as any).date ?? '').slice(0, 10),
      totalAmount: Number((expense as any).totalAmount) || 0,
      taxableAmount:
        Number(
          (expense as any).taxableAmount ??
            (expense as any).totalAmount
        ) || 0,
      gstAmount: Number((expense as any).gstAmount) || 0,
      isInventoryItem: Boolean((expense as any).isInventoryItem),
      inventoryItems: (expense as any).inventoryItems ?? undefined,
    };
    const instance = await DispatcherService.dispatchEvent(organizationId, resolvedOrchid, payload, {
      userId,
      role,
    });
    const journalResult = (instance as any)?.results?.[0];
    const journalId = journalResult?.success ? journalResult?.resultId : null;
    if (!journalId) {
      throw new Error((instance as any)?.errorMessage ?? 'Journal creation failed');
    }
    const updated = await ExpenseModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId), type: 'EXPENSE' },
      { $set: { status: 'POSTED', journalId } },
      { new: true }
    )
      .lean()
      .exec();
    return {
      expense: updated as (Expense & { _id: any }) | null,
      results: (instance as any)?.results ?? [],
      stockAdjustFailures: stockAdjustFailures.length
        ? stockAdjustFailures
        : undefined,
    };
  }

  static async pay(
    _id: string,
    _body: Record<string, any>,
    _organizationId: string
  ): Promise<(Expense & { _id: any }) | null> {
    return null;
  }

  static async cancel(id: string, organizationId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const res = await ExpenseModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
        type: 'EXPENSE',
        status: 'POSTED',
      },
      { $set: { status: 'CANCELLED' } }
    ).exec();
    return res != null;
  }
}
