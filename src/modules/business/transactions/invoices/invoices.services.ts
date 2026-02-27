import { Types } from 'mongoose';
import fs from 'node:fs';
import InvoiceModel from './invoices.model';
import type { Invoice } from './invoices.model';
import {
  createPaginationResult,
  type PaginationResult,
} from '@/lib/pagination';
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

/** Compute line taxableAmount, gstAmount, lineTotal from qty, rate, discount, gstRate */
function computeLineTotals(item: {
  qty: number;
  rate: number;
  discount?: number;
  gstRate?: number;
}) {
  const qty = Number(item.qty) || 0;
  const rate = Number(item.rate) || 0;
  const discount = Number(item.discount) || 0;
  const gstRate = Math.min(28, Math.max(0, Number(item.gstRate) || 0));
  const taxableAmount = Math.max(0, qty * rate - discount);
  const gstAmount = (taxableAmount * gstRate) / 100;
  const lineTotal = taxableAmount + gstAmount;
  return { taxableAmount, gstAmount, lineTotal, gstRate };
}

/** Build full items with computed totals; ensure each line has required fields */
function buildItemsWithTotals(
  items: Array<{
    productId?: string | null;
    qty: number;
    rate: number;
    discount?: number;
    gstRate?: number;
    name?: string | null;
    hsnOrSacCode?: string | null;
  }>
): Array<{
  productId?: Types.ObjectId;
  qty: number;
  rate: number;
  discount: number;
  taxableAmount: number;
  gstAmount: number;
  gstRate: number;
  lineTotal: number;
  name?: string;
  hsnOrSacCode?: string;
}> {
  return items.map((it) => {
    const { taxableAmount, gstAmount, lineTotal, gstRate } =
      computeLineTotals(it);
    return {
      productId:
        it.productId && Types.ObjectId.isValid(it.productId)
          ? new Types.ObjectId(it.productId)
          : undefined,
      qty: Number(it.qty) || 0,
      rate: Number(it.rate) || 0,
      discount: Number(it.discount) || 0,
      taxableAmount,
      gstAmount,
      gstRate,
      lineTotal,
      name: it.name ?? undefined,
      hsnOrSacCode: it.hsnOrSacCode ?? undefined,
    };
  });
}

/** Sum invoice totals from items */
function sumInvoiceTotals(
  items: Array<{ taxableAmount: number; gstAmount: number; lineTotal: number }>
) {
  let taxableAmount = 0;
  let gstAmount = 0;
  for (const it of items) {
    taxableAmount += Number(it.taxableAmount) || 0;
    gstAmount += Number(it.gstAmount) || 0;
  }
  const totalAmount = taxableAmount + gstAmount;
  return { taxableAmount, gstAmount, totalAmount };
}

export default class InvoicesServices {
  static async create(
    data: Record<string, any>,
    organizationId: string,
    userId?: string
  ): Promise<Invoice & { _id: any }> {
    const orgId = new Types.ObjectId(organizationId);
    const rawItems = Array.isArray(data.items) ? data.items : [];
    const items = buildItemsWithTotals(rawItems);
    const { taxableAmount, gstAmount, totalAmount } = sumInvoiceTotals(items);

    const doc = await InvoiceModel.create({
      type: 'INVOICE',
      organizationId: orgId,
      reference: String(data.reference).trim(),
      date: data.date ? new Date(data.date) : new Date(),
      contactId: new Types.ObjectId(data.contactId),
      totalAmount,
      taxableAmount,
      gstAmount,
      status: data.status ?? 'DRAFT',
      placeOfSupply: data.placeOfSupply ?? undefined,
      autoPosting: data.autoPosting ?? false,
      narration: data.narration ?? undefined,
      paymentDue: data.paymentDue ? new Date(data.paymentDue) : undefined,
      createdBy: userId ? new Types.ObjectId(userId) : undefined,
      updatedBy: userId ? new Types.ObjectId(userId) : undefined,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      paymentTerms: data.paymentTerms ?? undefined,
      paymentMode: data.paymentMode ?? 'CREDIT',
      items,
      discountTotal: Number(data.discountTotal) || 0,
      totalCost: Number(data.totalCost) || 0,
    } as any);

    return doc.toObject() as unknown as Invoice & { _id: any };
  }

  static async list(
    filters: {
      status?: string;
      contactId?: string;
      from?: string;
      to?: string;
      paymentDueBy?: string;
    },
    sort: Record<string, 1 | -1>,
    organizationId: string,
    page: number,
    limit: number
  ): Promise<PaginationResult<Invoice & { _id: any }>> {
    const q: any = {
      organizationId: new Types.ObjectId(organizationId),
      type: 'INVOICE',
    };
    if (filters.status) q.status = filters.status;
    if (filters.contactId) q.contactId = new Types.ObjectId(filters.contactId);
    if (filters.from || filters.to) {
      q.date = {};
      if (filters.from) q.date.$gte = new Date(filters.from);
      if (filters.to) q.date.$lte = new Date(filters.to);
    }
    if (filters.paymentDueBy)
      q.paymentDue = { $lte: new Date(filters.paymentDueBy) };

    const [data, total] = await Promise.all([
      InvoiceModel.find(q)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      InvoiceModel.countDocuments(q).exec(),
    ]);

    return createPaginationResult(
      data as unknown as (Invoice & { _id: any })[],
      total,
      page,
      limit
    );
  }

  static async getById(
    id: string,
    organizationId: string
  ): Promise<(Invoice & { _id: any }) | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await InvoiceModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
      type: 'INVOICE',
    })
      .lean()
      .exec();
    return doc as (Invoice & { _id: any }) | null;
  }

  static async update(
    id: string,
    data: Record<string, any>,
    organizationId: string,
    userId?: string
  ): Promise<(Invoice & { _id: any }) | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const existing = await InvoiceModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
      type: 'INVOICE',
    }).exec();
    if (!existing || (existing as any).status !== 'DRAFT') return null;

    const update: any = {};
    if (data.reference !== undefined)
      update.reference = String(data.reference).trim();
    if (data.date !== undefined) update.date = new Date(data.date);
    if (data.contactId !== undefined)
      update.contactId = new Types.ObjectId(data.contactId);
    if (data.placeOfSupply !== undefined)
      update.placeOfSupply = data.placeOfSupply;
    if (data.paymentDue !== undefined)
      update.paymentDue = data.paymentDue ? new Date(data.paymentDue) : null;
    if (data.narration !== undefined) update.narration = data.narration;
    if (data.dueDate !== undefined)
      update.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    if (data.paymentTerms !== undefined)
      update.paymentTerms = data.paymentTerms;
    if (data.paymentMode !== undefined) update.paymentMode = data.paymentMode;
    if (userId) update.updatedBy = new Types.ObjectId(userId);

    if (Array.isArray(data.items)) {
      const items = buildItemsWithTotals(data.items);
      const { taxableAmount, gstAmount, totalAmount } = sumInvoiceTotals(items);
      update.items = items;
      update.taxableAmount = taxableAmount;
      update.gstAmount = gstAmount;
      update.totalAmount = totalAmount;
    }

    const doc = await InvoiceModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
      },
      { $set: update },
      { new: true, runValidators: true }
    )
      .lean()
      .exec();
    return doc as (Invoice & { _id: any }) | null;
  }

  static async remove(id: string, organizationId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const existing = await InvoiceModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
      type: 'INVOICE',
    })
      .lean()
      .exec();
    if (!existing) return false;
    if ((existing as any).status !== 'DRAFT') return false; // only hard-delete DRAFT
    const res = await InvoiceModel.deleteOne({
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
      'placeOfSupply',
      'paymentDue',
      'items',
      'dueDate',
      'paymentTerms',
      'narration',
    ];
    const itemsExample = '[{"productId":"","qty":2,"rate":350,"gstRate":12}]';
    const exampleRow = [
      csvEscape('INV-000001'),
      csvEscape(new Date().toISOString().split('T')[0]!),
      csvEscape(''),
      csvEscape('CREDIT'),
      csvEscape('21-Odisha'),
      csvEscape(''),
      csvEscape(itemsExample),
      csvEscape(''),
      csvEscape('Net 30'),
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
      const rowNum = i + 2; // 1-based, row 1 = headers

      const reference = String(row.reference ?? '').trim();
      if (!reference) {
        errors.push({
          row: rowNum,
          field: 'reference',
          reason: 'reference is required',
        });
        continue;
      }

      let items: any[];
      try {
        const itemsStr = String(row.items ?? '[]').trim();
        items = itemsStr ? JSON.parse(itemsStr) : [];
      } catch {
        errors.push({
          row: rowNum,
          field: 'items',
          reason: 'items must be a JSON array',
        });
        continue;
      }
      if (!Array.isArray(items) || items.length === 0) {
        errors.push({
          row: rowNum,
          field: 'items',
          reason: 'at least one line item required',
        });
        continue;
      }

      const contactId = String(row.contactId ?? '').trim();
      if (!contactId || !Types.ObjectId.isValid(contactId)) {
        errors.push({
          row: rowNum,
          field: 'contactId',
          reason: 'valid contactId required',
        });
        continue;
      }

      const existing = await InvoiceModel.findOne({
        organizationId: orgId,
        type: 'INVOICE',
        reference,
      }).exec();
      if (existing) {
        errors.push({ row: rowNum, reason: 'reference already exists' });
        continue;
      }

      try {
        const built = buildItemsWithTotals(items);
        const { taxableAmount, gstAmount, totalAmount } =
          sumInvoiceTotals(built);
        const doc = await InvoiceModel.create({
          type: 'INVOICE',
          organizationId: orgId,
          reference,
          date: row.date ? new Date(row.date) : new Date(),
          contactId: new Types.ObjectId(contactId),
          totalAmount,
          taxableAmount,
          gstAmount,
          status: 'DRAFT',
          placeOfSupply: row.placeOfSupply?.trim() || undefined,
          paymentDue: row.paymentDue ? new Date(row.paymentDue) : undefined,
          createdBy: userId ? new Types.ObjectId(userId) : undefined,
          paymentMode: row.paymentMode?.trim() || 'CREDIT',
          dueDate: row.dueDate ? new Date(row.dueDate) : undefined,
          paymentTerms: row.paymentTerms?.trim() || undefined,
          narration: row.narration?.trim() || undefined,
          items: built,
          discountTotal: 0,
          totalCost: 0,
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

  /** Post invoice: stock out for product lines, dispatch journal event, set status POSTED and journalId. */
  static async post(
    id: string,
    organizationId: string,
    userId?: string,
    orchid?: string,
    role?: string
  ): Promise<{
    invoice: (Invoice & { _id: any }) | null;
    results?: any[];
    stockAdjustFailures?: any[];
  }> {
    if (!Types.ObjectId.isValid(id)) return { invoice: null };
    const invoice = await InvoiceModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
      type: 'INVOICE',
      status: 'DRAFT',
    })
      .lean()
      .exec();
    if (!invoice) return { invoice: null };

    const stockAdjustFailures: {
      productId: string;
      qty: number;
      reason: string;
    }[] = [];
    const items = (invoice as any).items ?? [];
    for (const item of items) {
      const productId = item.productId?.toString?.() ?? item.productId;
      if (!productId || !Types.ObjectId.isValid(productId)) continue;
      const qty = Number(item.qty) || 0;
      if (qty <= 0) continue;
      try {
        await ProductServices.adjustStock(productId, organizationId, userId, {
          type: 'STOCK_OUT',
          qty,
        });
      } catch (err) {
        stockAdjustFailures.push({
          productId,
          qty,
          reason: (err as Error).message,
        });
      }
    }

    const resolvedOrchid =
      (orchid && /^INVOICE_(CASH|ONLINE|CREDIT)$/i.test(orchid)
        ? orchid.toUpperCase()
        : null) ??
      `INVOICE_${String((invoice as any).paymentMode ?? 'CREDIT').toUpperCase()}`;
    const payload = {
      reference: (invoice as any).reference,
      date:
        (invoice as any).date instanceof Date
          ? (invoice as any).date.toISOString().slice(0, 10)
          : String((invoice as any).date ?? '').slice(0, 10),
      totalAmount: Number((invoice as any).totalAmount) || 0,
    };
    const instance = await DispatcherService.dispatchEvent(
      organizationId,
      resolvedOrchid,
      payload,
      {
        userId,
        role,
      }
    );
    const journalResult = (instance as any)?.results?.[0];
    const journalId = journalResult?.success ? journalResult?.resultId : null;
    if (!journalId) {
      throw new Error(
        (instance as any)?.errorMessage ?? 'Journal creation failed'
      );
    }
    const updated = await InvoiceModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
        type: 'INVOICE',
      },
      { $set: { status: 'POSTED', journalId } },
      { new: true }
    )
      .lean()
      .exec();
    return {
      invoice: updated as (Invoice & { _id: any }) | null,
      results: (instance as any)?.results ?? [],
      stockAdjustFailures: stockAdjustFailures.length
        ? stockAdjustFailures
        : undefined,
    };
  }

  /** Stub: record payment. Implement with payment record + journal. */
  static async pay(
    _id: string,
    _body: Record<string, any>,
    _organizationId: string
  ): Promise<(Invoice & { _id: any }) | null> {
    return null;
  }

  /** Cancel posted invoice (set status CANCELLED). Reversal journal can be added later. */
  static async cancel(id: string, organizationId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const res = await InvoiceModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
        type: 'INVOICE',
        status: 'POSTED',
      },
      { $set: { status: 'CANCELLED' } }
    ).exec();
    return res != null;
  }
}
