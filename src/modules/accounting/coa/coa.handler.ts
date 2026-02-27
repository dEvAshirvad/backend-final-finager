import { type Request, type Response } from 'express';
import Respond, { RespondWithPagination } from '@/lib/respond';
import { createSortObject, parsePagination } from '@/lib/pagination';
import COAServices from './coa.services';
import { Session, User } from '@/types/global';
import { COA, COACreate, COAUpdate } from './coa.model';
import { QueryFilter, QueryOptions } from 'mongoose';

export default class COAHandler {
  // --- Basic CRUD ---

  static async create(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { activeOrganizationId } = req.session as Session;

      const account = await COAServices.createAccount(
        req.body as COACreate,
        userId as string,
        activeOrganizationId as string
      );

      return Respond(res, account, 201);
    } catch (error) {
      throw error;
    }
  }

  static async list(req: Request, res: Response) {
    try {
      const { activeOrganizationId } = req.session as Session;
      if (!activeOrganizationId) {
        return Respond(res, { message: 'Active organization not found' }, 404);
      }

      const {
        sort,
        page = 1,
        limit = 10,
        name,
        code,
        type,
        order = 'asc',
      } = req.query;

      const result = await COAServices.getAccounts(
        { name: name as string, code: code as string, type: type as string },
        createSortObject(sort as string, order as 'asc' | 'desc' | '1' | '-1'),
        activeOrganizationId,
        page as number,
        limit as number
      );

      return RespondWithPagination(res, result, 200);
    } catch (error) {
      throw error;
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { activeOrganizationId } = req.session as Session;
      const account = await COAServices.getAccountById(
        id as string,
        activeOrganizationId as string
      );
      if (!account) {
        return Respond(res, { message: 'Account not found' }, 404);
      }
      return Respond(res, account, 200);
    } catch (error) {
      throw error;
    }
  }

  static async getByCode(req: Request, res: Response) {
    try {
      const { code } = req.params;
      const { activeOrganizationId } = req.session as Session;
      const account = await COAServices.getAccountByCode(
        activeOrganizationId as string,
        code as string
      );
      if (!account) {
        return Respond(res, { message: 'Account not found' }, 404);
      }
      return Respond(res, account, 200);
    } catch (error) {
      throw error;
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await COAServices.updateAccount(
        id as string,
        req.body as COAUpdate,
        req.user as User,
        req.session as Session
      );
      if (!result) {
        return Respond(res, { message: 'Account not found' }, 404);
      }
      return Respond(
        res,
        {
          message: 'Account updated',
          data: result.new,
          old: result.old,
          new: result.new,
          changes: result.changes,
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
        },
        200
      );
    } catch (error) {
      throw error;
    }
  }

  static async patch(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const { activeOrganizationId } = req.session as Session;
      const result = await COAServices.patchAccount(
        id as string,
        req.body,
        userId,
        activeOrganizationId
      );
      if (!result) {
        return Respond(res, { message: 'Account not found' }, 404);
      }
      return Respond(
        res,
        {
          message: 'Account patched',
          old: result.old,
          new: result.new,
          changes: result.changes,
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
        },
        200
      );
    } catch (error) {
      throw error;
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { activeOrganizationId } = req.session as Session;
      const deleted = await COAServices.deleteAccount(
        id as string,
        activeOrganizationId as string
      );
      if (!deleted) {
        return Respond(res, { message: 'Account not found' }, 404);
      }
      return Respond(res, { message: 'Account deleted' }, 200);
    } catch (error) {
      throw error;
    }
  }

  // --- Template ---

  static async getTemplateByIndustry(req: Request, res: Response) {
    try {
      const { industry } = req.params;
      const industryParam =
        (Array.isArray(industry) ? industry[0] : industry) ?? '';
      const accounts = COAServices.getTemplateByIndustry(
        industryParam as 'retail' | 'serviceBased' | 'manufacturing'
      );
      return Respond(res, { industry, accounts }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async createFromTemplate(req: Request, res: Response) {
    try {
      const { accounts } = req.body as {
        accounts: COACreate[];
      };
      const { activeOrganizationId } = req.session as Session;
      const userId = req.user?.id;

      const created = await COAServices.createFromTemplate({
        organizationId: activeOrganizationId as string,
        userId,
        accounts,
      });

      return Respond(res, created, 201);
    } catch (error) {
      throw error;
    }
  }

  // --- Tree ---

  static async getFullTree(req: Request, res: Response) {
    try {
      const { activeOrganizationId } = req.session as Session;
      const tree = await COAServices.getFullTree(
        activeOrganizationId as string
      );
      return Respond(res, tree, 200);
    } catch (error) {
      throw error;
    }
  }

  static async getRootAccounts(req: Request, res: Response) {
    try {
      const { activeOrganizationId } = req.session as Session;
      const roots = await COAServices.getRootAccounts(
        activeOrganizationId as string
      );
      return Respond(res, roots, 200);
    } catch (error) {
      throw error;
    }
  }

  static async getLeafAccounts(req: Request, res: Response) {
    try {
      const { activeOrganizationId } = req.session as Session;
      const leaves = await COAServices.getLeafAccounts(
        activeOrganizationId as string
      );
      return Respond(res, leaves, 200);
    } catch (error) {
      throw error;
    }
  }

  // --- Hierarchy navigation ---

  static async getAncestors(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { activeOrganizationId } = req.session as Session;

      const ancestors = await COAServices.getAncestors(
        activeOrganizationId as string,
        id as string
      );
      return Respond(res, ancestors, 200);
    } catch (error) {
      throw error;
    }
  }

  static async getDescendants(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { activeOrganizationId } = req.session as Session;

      const descendants = await COAServices.getDescendants(
        activeOrganizationId as string,
        id as string
      );
      return Respond(res, descendants, 200);
    } catch (error) {
      throw error;
    }
  }

  static async getChildren(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { activeOrganizationId } = req.session as Session;
      const children = await COAServices.getChildren(
        activeOrganizationId as string,
        id as string
      );
      return Respond(res, children, 200);
    } catch (error) {
      throw error;
    }
  }

  static async getPath(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { activeOrganizationId } = req.session as Session;

      const path = await COAServices.getPath(
        activeOrganizationId as string,
        id as string
      );
      return Respond(res, path, 200);
    } catch (error) {
      throw error;
    }
  }

  static async getLevel(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { activeOrganizationId } = req.session as Session;
      const level = await COAServices.getLevel(
        activeOrganizationId as string,
        id as string
      );
      return Respond(res, { level }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async move(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { newParentCode } = req.body as {
        newParentCode: string | null;
      };
      const { activeOrganizationId } = req.session as Session;
      const userId = req.user?.id;

      const account = await COAServices.moveAccount(
        activeOrganizationId as string,
        id as string,
        newParentCode ?? null,
        userId
      );
      if (!account) {
        return Respond(res, { message: 'Account not found' }, 404);
      }
      return Respond(res, { message: 'Account moved', ...account }, 200);
    } catch (error) {
      throw error;
    }
  }

  // --- Statistics ---

  static async getOverviewStatistics(req: Request, res: Response) {
    try {
      const { activeOrganizationId } = req.session as Session;
      const stats = await COAServices.getOverviewStatistics(
        activeOrganizationId as string
      );
      return Respond(res, stats, 200);
    } catch (error) {
      throw error;
    }
  }

  // --- Journal entries (placeholder) ---

  static async getJournalEntries(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { activeOrganizationId } = req.session as Session;
      const { page = 1, limit = 10, status, dateFrom, dateTo } = req.query;
      const entries = await COAServices.getJournalEntriesForAccount({
        organizationId: activeOrganizationId as string,
        accountId: id as string,
        page: page as number,
        limit: limit as number,
        status: status as string,
        dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo: dateTo ? new Date(dateTo as string) : undefined,
      });

      return Respond(res, { entries }, 200);
    } catch (error) {
      throw error;
    }
  }
}
