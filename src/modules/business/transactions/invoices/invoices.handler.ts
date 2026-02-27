import { type Request, type Response } from 'express';
import Respond, { RespondWithPagination } from '@/lib/respond';
import { createSortObject, parsePagination } from '@/lib/pagination';
import InvoicesServices from './invoices.services';
import { Session } from '@/types/global';

async function requireOrgMember(req: Request, res: Response) {
  const userId = req.user?.id;
  const { activeOrganizationId } = req.session as Session;
  if (!userId || !activeOrganizationId) {
    Respond(res, { message: 'Active organization not found' }, 403);
    return null;
  }
  return {
    organizationId: activeOrganizationId,
    userId,
    role: req.user?.role ?? 'staff',
  };
}

function getId(req: Request): string {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  return id ?? '';
}

export default class InvoicesHandler {
  static async create(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    try {
      const body = req.body as Record<string, any>;
      const invoice = await InvoicesServices.create(
        body,
        ctx.organizationId,
        ctx.userId
      );
      return Respond(res, { invoice }, 201);
    } catch (error) {
      throw error;
    }
  }

  static async list(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    try {
      const { page = 1, limit = 20 } = parsePagination(req);
      const { status, contactId, from, to, paymentDueBy, sort, order } = req.query;
      const result = await InvoicesServices.list(
        {
          status: status as string,
          contactId: contactId as string,
          from: from as string,
          to: to as string,
          paymentDueBy: paymentDueBy as string,
        },
        createSortObject(sort as string, order as 'asc' | 'desc' | '1' | '-1'),
        ctx.organizationId,
        Number(page),
        Number(limit)
      );
      return RespondWithPagination(res, result, 200);
    } catch (error) {
      throw error;
    }
  }

  static async getById(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    try {
      const id = getId(req);
      const invoice = await InvoicesServices.getById(id, ctx.organizationId);
      if (!invoice) return Respond(res, { message: 'Invoice not found' }, 404);
      return Respond(res, { invoice }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async update(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    try {
      const id = getId(req);
      const invoice = await InvoicesServices.update(
        id,
        req.body as Record<string, any>,
        ctx.organizationId,
        ctx.userId
      );
      if (!invoice) return Respond(res, { message: 'Invoice not found or not editable (only DRAFT)' }, 404);
      return Respond(res, { invoice }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async remove(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    if (ctx.role === 'staff')
      return Respond(res, { message: 'Staff cannot delete invoices' }, 403);
    try {
      const id = getId(req);
      const deleted = await InvoicesServices.remove(id, ctx.organizationId);
      if (deleted) return Respond(res, { message: 'Invoice deleted' }, 200);
      const cancelled = await InvoicesServices.cancel(id, ctx.organizationId);
      if (cancelled) return Respond(res, { message: 'Invoice cancelled' }, 200);
      return Respond(res, { message: 'Invoice not found' }, 404);
    } catch (error) {
      throw error;
    }
  }

  static async post(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    try {
      const id = getId(req);
      const orchid = (req.body as any)?.orchid as string | undefined;
      const result = await InvoicesServices.post(
        id,
        ctx.organizationId,
        ctx.userId,
        orchid,
        ctx.role
      );
      if (!result.invoice)
        return Respond(res, { message: 'Invoice not found or post not implemented' }, 404);
      return Respond(res, { invoice: result.invoice, results: result.results, stockAdjustFailures: result.stockAdjustFailures }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async pay(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    if (ctx.role === 'staff')
      return Respond(res, { message: 'Only owner/ca can record payment' }, 403);
    try {
      const id = getId(req);
      const invoice = await InvoicesServices.pay(
        id,
        req.body as Record<string, any>,
        ctx.organizationId
      );
      if (!invoice) return Respond(res, { message: 'Invoice not found or pay not implemented' }, 404);
      return Respond(res, { invoice }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async downloadTemplate(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    try {
      const buffer = InvoicesServices.getTemplateCsvBuffer();
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="invoices-import-template.csv"'
      );
      return res.send(buffer);
    } catch (error) {
      throw error;
    }
  }

  static async bulkImportCsv(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    try {
      const file = (req as Request & { file?: { path: string } }).file;
      if (!file?.path)
        return Respond(res, { message: 'No file uploaded. Use form field "file" with a CSV.' }, 400);
      const result = await InvoicesServices.bulkImportFromCsv(
        file.path,
        ctx.organizationId,
        ctx.userId
      );
      return Respond(
        res,
        { message: `Imported ${result.hit}`, ...result },
        200
      );
    } catch (error) {
      throw error;
    }
  }

  static async exportJson(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    try {
      const { status, contactId, from, to } = req.query;
      const result = await InvoicesServices.list(
        {
          status: status as string,
          contactId: contactId as string,
          from: from as string,
          to: to as string,
        },
        { date: -1 },
        ctx.organizationId,
        1,
        10000
      );
      return Respond(res, { invoices: result.data, pagination: result.pagination }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async exportCsv(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    try {
      const result = await InvoicesServices.list(
        {},
        { date: -1 },
        ctx.organizationId,
        1,
        10000
      );
      const headers = [
        'reference',
        'date',
        'contactId',
        'paymentMode',
        'placeOfSupply',
        'paymentDue',
        'status',
        'totalAmount',
        'taxableAmount',
        'gstAmount',
      ];
      const escape = (v: any) => {
        const s = typeof v === 'object' && v !== null && v instanceof Date ? v.toISOString() : String(v ?? '');
        return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const rows = (result.data as any[]).map((inv) =>
        headers.map((h) => escape(inv[h])).join(',')
      );
      const csv = [headers.join(','), ...rows].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="invoices-export-${Date.now()}.csv"`
      );
      return res.send(Buffer.from(csv, 'utf-8'));
    } catch (error) {
      throw error;
    }
  }
}
