import { type Request, type Response } from 'express';
import Respond, { RespondWithPagination } from '@/lib/respond';
import { createSortObject, parsePagination } from '@/lib/pagination';
import ContactServices, { autoFillName } from './contacts.services';
import type { ContactCreate, ContactUpdate } from './contacts.model';
import { Session } from '@/types/global';

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

export default class ContactsHandler {
  static async create(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;

    try {
      const body = req.body as ContactCreate;
      const contact = await ContactServices.create(
        {
          ...body,
          name: body.name?.trim() || autoFillName(body),
        },
        ctx.organizationId,
        ctx.userId
      );
      const warnings = ContactServices.getWarnings(contact);
      return Respond(
        res,
        { contact, warnings: warnings.messages.length ? warnings : undefined },
        201
      );
    } catch (error) {
      throw error;
    }
  }

  static async list(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;

    try {
      const { page = 1, limit = 10, sort, order } = parsePagination(req);
      const { type, name, isActive } = req.query;
      const result = await ContactServices.list(
        {
          type: type as string,
          name: name as string,
          isActive:
            isActive === 'true'
              ? true
              : isActive === 'false'
                ? false
                : undefined,
        },
        createSortObject(sort as string, order as 'asc' | 'desc' | '1' | '-1'),
        ctx.organizationId,
        page,
        limit
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
      const contact = await ContactServices.getById(id!, ctx.organizationId);
      if (!contact) {
        return Respond(res, { message: 'Contact not found' }, 404);
      }
      const warnings = ContactServices.getWarnings(contact);
      return Respond(res, { contact, warnings }, 200);
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
      const contact = await ContactServices.update(
        id!,
        req.body as ContactUpdate,
        ctx.organizationId,
        ctx.userId
      );
      if (!contact) {
        return Respond(res, { message: 'Contact not found' }, 404);
      }
      const warnings = ContactServices.getWarnings(contact);
      return Respond(res, { contact, warnings }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async remove(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    if (ctx.role === 'staff') {
      return Respond(res, { message: 'Staff cannot delete contacts' }, 403);
    }

    try {
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
      const deleted = await ContactServices.remove(id!, ctx.organizationId);
      if (!deleted) {
        return Respond(res, { message: 'Contact not found' }, 404);
      }
      return Respond(res, { message: 'Contact deleted' }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async exportJson(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;

    try {
      const { type } = req.query;
      const data = await ContactServices.exportJson(ctx.organizationId, {
        type: type as string,
      });
      return Respond(res, { contacts: data, count: data.length }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async exportCsv(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;

    try {
      const { type } = req.query;
      const csv = await ContactServices.exportCsv(ctx.organizationId, {
        type: type as string,
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="contacts-export-${Date.now()}.csv"`
      );
      return res.send(csv);
    } catch (error) {
      throw error;
    }
  }

  static async downloadTemplate(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;

    const buffer = ContactServices.getTemplateCsvBuffer();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="contacts-import-template.csv"'
    );
    return res.send(buffer);
  }

  static async bulkImport(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;

    try {
      const { contacts } = req.body as { contacts: Record<string, unknown>[] };
      if (!Array.isArray(contacts)) {
        return Respond(
          res,
          { message: 'Body must include contacts array' },
          400
        );
      }
      const result = await ContactServices.bulkImport(
        contacts,
        ctx.organizationId
      );
      return Respond(
        res,
        {
          message: `Imported ${result.hit} contacts, ${result.miss} failed`,
          hit: result.hit,
          miss: result.miss,
          errors: result.errors,
          imported: result.imported,
        },
        200
      );
    } catch (error) {
      throw error;
    }
  }

  /** Import contacts from uploaded CSV file */
  static async bulkImportCsv(req: Request, res: Response) {
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
      const result = await ContactServices.bulkImportFromCsv(
        file.path,
        ctx.organizationId
      );
      return Respond(
        res,
        {
          message: `Imported ${result.hit} contacts, ${result.miss} failed`,
          hit: result.hit,
          miss: result.miss,
          errors: result.errors,
          imported: result.imported,
        },
        200
      );
    } catch (error) {
      throw error;
    }
  }

  /** Map CSV/Excel headers to schema fields - for UI field mapping */
  static async mapHeaders(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;

    try {
      const { headers } = req.body as { headers: string[] };
      if (!Array.isArray(headers)) {
        return Respond(
          res,
          { message: 'Body must include headers array' },
          400
        );
      }
      const mapping = ContactServices.mapHeaders(headers);
      return Respond(res, { mapping }, 200);
    } catch (error) {
      throw error;
    }
  }
}
