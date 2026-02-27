import { type Request, type Response } from 'express';
import Respond, { RespondWithPagination } from '@/lib/respond';
import { createSortObject, parsePagination } from '@/lib/pagination';
import ProductServices from './products.services';
import { Session } from '@/types/global';
import DispatcherService from '@/modules/accounting/events/dispatcher.service';
import { serialize } from '@/lib/serializer';

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

export default class ProductsHandler {
  static async create(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    try {
      const body = req.body;
      const product = await ProductServices.create(
        body as any,
        ctx.organizationId,
        ctx.userId
      );

      // PRODUCT_ADDED template: required productId, name, totalCost, date
      await DispatcherService.dispatchEvent(
        ctx.organizationId,
        req.body?.orchid || 'PRODUCT_ADDED',
        {
          productId: product._id?.toString() ?? '',
          name: product.name,
          totalCost: Number(product.costPrice ?? 0),
          date: new Date().toISOString(),
        },
        { userId: ctx.userId, role: ctx.role }
      );
      return Respond(res, { product }, 201);
    } catch (error) {
      throw error;
    }
  }

  static async list(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    try {
      const { page = 1, limit = 20 } = parsePagination(req);
      const { search, category, isActive, tags, sort, order } = req.query;
      const result = await ProductServices.list(
        {
          search: search as string,
          category: category as string,
          tags: tags
            ? String(tags)
                .split(',')
                .map((s) => s.trim())
            : undefined,
          isActive:
            isActive === 'true'
              ? true
              : isActive === 'false'
                ? false
                : undefined,
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
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
      const product = await ProductServices.getById(id!, ctx.organizationId);
      if (!product) return Respond(res, { message: 'Product not found' }, 404);
      return Respond(res, { product }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async update(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    try {
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
      // Prevent update API from changing stock quantities directly.
      const safeBody = { ...req.body } as any;
      if ('variants' in safeBody) delete safeBody.variants;
      const product = await ProductServices.update(
        id!,
        safeBody,
        ctx.organizationId,
        ctx.userId
      );
      if (!product) return Respond(res, { message: 'Product not found' }, 404);
      return Respond(res, { product }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async stockAdjust(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    try {
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
      const { type, variant, qty, reason, costPrice, orchid } = req.body as {
        type: 'STOCK_IN' | 'STOCK_OUT' | 'STOCK_ADJUSTED';
        variant?: string;
        qty: number;
        reason?: string;
        costPrice?: number;
        orchid?: string;
      };
      const product = await ProductServices.adjustStock(
        id!,
        ctx.organizationId,
        ctx.userId,
        {
          type,
          variant,
          qty,
          reason,
          costPrice,
        }
      );
      if (!product) return Respond(res, { message: 'Product not found' }, 404);
      // dispatch event for accounting (journal) — allow orchid override in body
      try {
        const dispatchOrchid =
          typeof orchid === 'string' && orchid.length
            ? orchid
            : type === 'STOCK_IN'
              ? 'STOCK_IN'
              : type === 'STOCK_OUT'
                ? 'STOCK_OUT'
                : 'STOCK_ADJUSTED';
        const totalCost = Number(qty) * Number(costPrice ?? product.costPrice ?? 0);
        // STOCK_IN / STOCK_OUT: required productName, qty, totalCost, date
        // STOCK_ADJUSTED: required productName, adjustmentValue, adjustmentType, date (linesRule uses adjustmentValue)
        const payload: Record<string, any> = {
          productName: product.name,
          qty,
          totalCost,
          date: new Date().toISOString(),
          adjustmentType: type,
          adjustmentValue: totalCost,
          reason,
        };
        const Dispatcher = (
          await import('@/modules/accounting/events/dispatcher.service')
        ).default;
        await Dispatcher.dispatchEvent(
          ctx.organizationId,
          dispatchOrchid,
          payload,
          { userId: ctx.userId, role: ctx.role }
        );
      } catch (err) {
        // log and continue — stock adjustment succeeded, but event dispatch failed
        console.error(
          'Event dispatch failed for stockAdjust',
          (err as Error).message
        );
      }
      return Respond(res, { product }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async remove(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    if (ctx.role === 'staff')
      return Respond(res, { message: 'Staff cannot delete products' }, 403);
    try {
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
      const ok = await ProductServices.remove(id!, ctx.organizationId);
      if (!ok) return Respond(res, { message: 'Product not found' }, 404);
      return Respond(res, { message: 'Product deleted' }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async exportJson(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    try {
      const { category, isActive } = req.query;
      const rows = await ProductServices.list(
        {
          category: category as string,
          isActive:
            isActive === 'true'
              ? true
              : isActive === 'false'
                ? false
                : undefined,
        },
        {},
        ctx.organizationId,
        1,
        10000
      );
      return Respond(
        res,
        { products: rows.data, pagination: rows.pagination },
        200
      );
    } catch (error) {
      throw error;
    }
  }

  static async exportCsv(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    try {
      const buf = await ProductServices.getTemplateCsvBuffer(); // reuse template for headers; in future build full CSV
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="products-export-${Date.now()}.csv"`
      );
      return res.send(buf);
    } catch (error) {
      throw error;
    }
  }

  static async downloadTemplate(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    try {
      const buffer = ProductServices.getTemplateCsvBuffer();
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="products-import-template.csv"'
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
      // Multer middleware (uploadContactCsv.single('file')) should populate req.file
      const file = (req as Request & { file?: { path: string } }).file;
      if (!file?.path) {
        return Respond(
          res,
          { message: 'No file uploaded. Use form field "file" with a CSV.' },
          400
        );
      }
      const result = await ProductServices.bulkImportFromCsv(
        file.path,
        ctx.organizationId
      )

      // According to result create event

      const totalCost = (result.imported || []).reduce((acc, product) => {
        const variants = Array.isArray((product as any).variants) ? (product as any).variants : [];
        const variantSum = variants.reduce((ac: number, pr: any) => ac + Number(pr?.costPrice ?? 0), 0);
        return acc + variantSum;
      }, 0);

      // BULK_PRODUCT_ADDED template: required importedCount, totalCost, date
      await DispatcherService.dispatchEvent(
        ctx.organizationId,
        (req.body && (req.body as any).orchid) || 'BULK_PRODUCT_ADDED',
        {
          importedCount: result.imported?.length ?? 0,
          totalCost,
          date: new Date().toISOString(),
        },
        { userId: ctx.userId, role: ctx.role }
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
}
