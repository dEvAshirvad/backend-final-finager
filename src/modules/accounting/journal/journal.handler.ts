import { type Request, type Response } from 'express';
import { Types } from 'mongoose';
import Respond, { RespondWithPagination } from '@/lib/respond';
import { parsePagination } from '@/lib/pagination';
import JournalServices from './journal.services';
import type {
  JournalEntryCreate,
  JournalEntryUpdate,
  JournalBulkCreate,
} from './journal.model';
import { Session } from '@/types/global';
import { MemberModel } from '@/modules/auth/members/members.model';
import APIError from '@/configs/errors/APIError';

async function requireOrgMember(
  req: Request,
  res: Response
): Promise<{ organizationId: string; userId: string; role: string } | null> {
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

export default class JournalHandler {
  static async create(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;

    try {
      const entry = await JournalServices.createJournalEntry({
        ...(req.body as JournalEntryCreate),
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        role: ctx.role,
      });
      return Respond(res, entry, 201);
    } catch (error) {
      throw error;
    }
  }

  static async createMany(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;

    try {
      const { entries } = req.body as { entries: JournalBulkCreate };
      const created = await JournalServices.createManyJournalEntries(entries, {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        role: ctx.role,
      });
      return Respond(res, { created, count: created.length }, 201);
    } catch (error) {
      throw error;
    }
  }

  static async list(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;

    try {
      const { page = 1, limit = 10, sort, order } = parsePagination(req);
      const {
        reference,
        dateFrom,
        dateTo,
        description,
        status,
        createdBy,
        updatedBy,
        createdAt,
        updatedAt,
      } = req.query;
      const result = await JournalServices.listJournalEntries({
        query: {
          reference: reference as string,
          dateFrom: dateFrom
            ? new Date(dateFrom as unknown as string)
            : undefined,
          dateTo: dateTo ? new Date(dateTo as unknown as string) : undefined,
          description: description as string,
          status: status as string,
          createdBy: createdBy as string,
          updatedBy: updatedBy as string,
          createdAt: createdAt
            ? new Date(createdAt as unknown as string)
            : undefined,
          updatedAt: updatedAt
            ? new Date(updatedAt as unknown as string)
            : undefined,
        },
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        role: ctx.role,
        page,
        limit,
        sort: sort as string,
        order: order as 'asc' | 'desc' | '1' | '-1',
      });
      return RespondWithPagination(res, result, 200);
    } catch (error) {
      throw error;
    }
  }

  static async getById(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;

    try {
      const { id } = req.params;
      const entry = await JournalServices.getJournalEntryById({
        id: id as string,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        role: ctx.role,
      });
      if (!entry) {
        return Respond(res, { message: 'Journal entry not found' }, 404);
      }
      return Respond(res, entry, 200);
    } catch (error) {
      throw error;
    }
  }

  static async update(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;

    try {
      const { id } = req.params;
      const body = req.body as JournalEntryUpdate;

      const entry = await JournalServices.updateJournalEntry({
        id: id as string,
        data: body,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        role: ctx.role,
      });
      if (!entry) {
        return Respond(
          res,
          {
            message:
              'Journal entry not found or not updatable (only own DRAFT entries)',
          },
          404
        );
      }
      return Respond(res, entry, 200);
    } catch (error) {
      throw error;
    }
  }

  static async remove(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;

    try {
      const { id } = req.params;
      const deleted = await JournalServices.deleteJournalEntry({
        id: id as string,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        role: ctx.role,
      });
      if (!deleted) {
        return Respond(
          res,
          {
            message:
              'Journal entry not found or not deletable (only own DRAFT entries)',
          },
          404
        );
      }
      return Respond(res, { message: 'Journal entry deleted' }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async post(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;

    const isFullAccess = ctx.role === 'ca' || ctx.role === 'owner';
    if (!isFullAccess) {
      return Respond(
        res,
        { message: 'Only owner or CA can post journal entries' },
        403
      );
    }

    try {
      const { ids } = req.body as { ids: string[] };
      const result = await JournalServices.postManyJournalEntries({
        ids,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        role: ctx.role,
      });
      return Respond(
        res,
        {
          message: `Posted ${result.posted.length} entries${result.failed.length ? `, ${result.failed.length} failed` : ''}`,
          posted: result.posted,
          failed: result.failed,
        },
        200
      );
    } catch (error) {
      throw error;
    }
  }

  static async reverse(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;

    const isFullAccess = ctx.role === 'ca' || ctx.role === 'owner';
    if (!isFullAccess) {
      return Respond(
        res,
        { message: 'Only owner or CA can reverse journal entries' },
        403
      );
    }

    try {
      const { ids } = req.body as { ids: string[] };
      const result = await JournalServices.reverseManyJournalEntries({
        ids,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        role: ctx.role,
      });
      return Respond(
        res,
        {
          message: `Reversed ${result.reversed.length} entries${result.failed.length ? `, ${result.failed.length} failed` : ''}`,
          reversed: result.reversed,
          failed: result.failed,
        },
        200
      );
    } catch (error) {
      throw error;
    }
  }

  static async validate(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;

    try {
      const { lines, organizationId } = req.body as {
        lines: { accountId: string; debit: number; credit: number }[];
        organizationId?: string;
      };
      const orgId = organizationId || ctx.organizationId;
      const validation = await JournalServices.validateJournelTransactions(
        lines,
        orgId
      );
      return Respond(res, validation, 200);
    } catch (error) {
      if (error instanceof APIError) throw error;
      throw error;
    }
  }

  static async downloadTemplate(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    try {
      const buffer = JournalServices.getJournalTemplateCsvBuffer();
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="journal-import-template.csv"'
      );
      return res.send(buffer);
    } catch (error) {
      throw error;
    }
  }

  static async importCsv(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    try {
      const file = (req as Request & { file?: { path: string } }).file;
      if (!file?.path) {
        return Respond(
          res,
          { message: 'No file uploaded. Use form field "file" with a CSV.' },
          400
        );
      }
      const result = await JournalServices.importFromCsv(file.path, {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        role: ctx.role,
      });
      return Respond(
        res,
        {
          message: `Imported ${result.count} journal entries`,
          created: result.created,
          count: result.count,
          errors: result.errors,
        },
        201
      );
    } catch (error) {
      if (error instanceof APIError) throw error;
      throw error;
    }
  }
}
