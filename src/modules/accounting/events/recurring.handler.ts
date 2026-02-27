import { type Request, type Response } from 'express';
import Respond from '@/lib/respond';
import { Session } from '@/types/global';
import { RecurringModel } from './recurring.model';
import RecurringScheduler from './recurring.service';

async function requireOrgMember(req: Request, res: Response) {
  const userId = req.user?.id;
  const { activeOrganizationId } = req.session as Session;
  if (!userId || !activeOrganizationId) {
    Respond(res, { message: 'Active organization not found' }, 403);
    return null;
  }
  return { organizationId: activeOrganizationId, userId, role: req.user?.role };
}

export default class RecurringHandler {
  static async create(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    const body = req.body;
    const payload = {
      ...body,
      organizationId: ctx.organizationId,
      createdBy: ctx.userId,
    };
    const doc = await RecurringScheduler.createAndSchedule(payload);
    return Respond(res, { recurring: doc }, 201);
  }

  static async list(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    const docs = await RecurringModel.find({ organizationId: ctx.organizationId }).lean().exec();
    return Respond(res, { recurrences: docs }, 200);
  }

  static async remove(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    const id = String(req.params.id);
    await RecurringModel.findOneAndUpdate({ _id: id, organizationId: ctx.organizationId }, { $set: { enabled: false } }).exec();
    await RecurringScheduler.cancel(id);
    return Respond(res, { message: 'Recurring disabled' }, 200);
  }
}

