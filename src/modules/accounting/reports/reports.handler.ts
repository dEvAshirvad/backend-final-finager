import { type Request, type Response } from 'express';
import Respond from '@/lib/respond';
import ReportsServices, {
  type PnLConfig,
  type CashFlowConfig,
} from './reports.services';
import { Session } from '@/types/global';
import { MemberModel } from '@/modules/auth/members/members.model';

async function requireOrgMember(
  req: Request,
  res: Response
): Promise<{ organizationId: string; userId: string; role?: string } | null> {
  const userId = req.user?.id;
  const { activeOrganizationId } = req.session as Session;

  if (!userId || !activeOrganizationId) {
    Respond(res, { message: 'Active organization not found' }, 403);
    return null;
  }

  return { organizationId: activeOrganizationId, userId, role: req.user?.role };
}

export default class ReportsHandler {
  static async getTrialBalance(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;

    try {
      const asOfDate = req.query.asOfDate
        ? new Date(req.query.asOfDate as string)
        : undefined;
      const report = await ReportsServices.getTrialBalance(
        ctx.organizationId,
        asOfDate
      );
      return Respond(res, { message: 'Trial balance report', ...report }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async getBalanceSheet(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;

    try {
      const asOfDate = req.query.asOfDate
        ? new Date(req.query.asOfDate as string)
        : undefined;
      const report = await ReportsServices.getBalanceSheet(
        ctx.organizationId,
        asOfDate
      );
      return Respond(res, { message: 'Balance sheet report', ...report }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async getNetIncome(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;

    try {
      const { periodFrom, periodTo } = req.query;
      if (!periodFrom || !periodTo) {
        return Respond(
          res,
          { message: 'periodFrom and periodTo query params are required' },
          400
        );
      }
      const report = await ReportsServices.getNetIncome(
        ctx.organizationId,
        new Date(periodFrom as string),
        new Date(periodTo as string)
      );
      return Respond(res, { message: 'Net income report', ...report }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async getInventoryValuation(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;

    try {
      const asOfDate = req.query.asOfDate
        ? new Date(req.query.asOfDate as string)
        : undefined;
      const inventoryParentCode = req.query.inventoryParentCode as
        | string
        | undefined;

      const report = await ReportsServices.getInventoryValuation(
        ctx.organizationId,
        asOfDate,
        inventoryParentCode
      );
      return Respond(
        res,
        { message: 'Inventory valuation report', ...report },
        200
      );
    } catch (error) {
      throw error;
    }
  }

  static async getGSTSummary(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;

    try {
      const { periodFrom, periodTo } = req.query;
      if (!periodFrom || !periodTo) {
        return Respond(
          res,
          { message: 'periodFrom and periodTo query params are required' },
          400
        );
      }

      const report = await ReportsServices.getGSTSummary(
        ctx.organizationId,
        new Date(periodFrom as string),
        new Date(periodTo as string)
      );
      return Respond(res, { message: 'GST summary report', ...report }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async getPnL(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;

    try {
      const { periodFrom, periodTo, config } = req.body as {
        periodFrom: string;
        periodTo: string;
        config?: PnLConfig;
      };
      if (!periodFrom || !periodTo) {
        return Respond(
          res,
          { message: 'periodFrom and periodTo are required in body' },
          400
        );
      }

      const report = await ReportsServices.getPnL(
        ctx.organizationId,
        new Date(periodFrom),
        new Date(periodTo),
        config
      );
      return Respond(res, { message: 'P&L report', ...report }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async getCashFlow(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;

    try {
      const { periodFrom, periodTo, config } = req.body as {
        periodFrom: string;
        periodTo: string;
        config?: CashFlowConfig;
      };
      if (!periodFrom || !periodTo) {
        return Respond(
          res,
          { message: 'periodFrom and periodTo are required in body' },
          400
        );
      }

      const report = await ReportsServices.getCashFlow(
        ctx.organizationId,
        new Date(periodFrom),
        new Date(periodTo),
        config
      );
      return Respond(res, { message: 'Cash flow report', ...report }, 200);
    } catch (error) {
      throw error;
    }
  }
}
