import { type Request, type Response } from 'express';
import Respond from '@/lib/respond';
import { Session } from '@/types/global';
import EventTemplateService from './template.service';
import DispatcherService from './dispatcher.service';
import { EventInstanceModel } from './events.model';
import { createPaginationResult } from '@/lib/pagination';

async function requireOrgMember(req: Request, res: Response) {
  const userId = req.user?.id;
  const { activeOrganizationId } = req.session as Session;
  if (!userId || !activeOrganizationId) {
    Respond(res, { message: 'Active organization not found' }, 403);
    return null;
  }
  return { organizationId: activeOrganizationId, userId, role: req.user?.role };
}

export default class EventsHandler {
  static async listTemplates(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    const { page = '1', limit = '20', orchid, name, isActive } = req.query;
    const q: any = {};
    if (orchid) q.orchid = String(orchid).toUpperCase();
    if (name) q.name = String(name);
    if (isActive !== undefined) q.isActive = isActive === 'true';
    const result = await EventTemplateService.list(
      ctx.organizationId,
      q,
      Number(page),
      Number(limit)
    );
    return Respond(res, { templates: result.data, total: result.total }, 200);
  }

  static async createTemplate(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    try {
      const body = req.body;
      const created = await EventTemplateService.createTemplate(
        body,
        ctx.organizationId
      );
      return Respond(res, { template: created }, 201);
    } catch (err) {
      throw err;
    }
  }

  static async getTemplate(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    const orchid = String(req.params.orchid).toUpperCase();
    const tpl = await EventTemplateService.getByOrchid(
      ctx.organizationId,
      orchid
    );
    if (!tpl) return Respond(res, { message: 'Template not found' }, 404);
    return Respond(res, { template: tpl }, 200);
  }

  static async updateTemplate(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    const orchid = String(req.params.orchid).toUpperCase();
    const patched = await EventTemplateService.updateByOrchid(
      ctx.organizationId,
      orchid,
      req.body
    );
    if (!patched) return Respond(res, { message: 'Template not found' }, 404);
    return Respond(res, { template: patched }, 200);
  }

  static async deleteTemplate(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    const orchid = String(req.params.orchid).toUpperCase();
    const deleted = await EventTemplateService.deleteByOrchid(
      ctx.organizationId,
      orchid
    );
    if (!deleted) return Respond(res, { message: 'Template not found' }, 404);
    return Respond(res, { template: deleted }, 200);
  }

  static async dispatch(req: Request, res: Response) {
    const ctx = await requireOrgMember(req, res);
    if (!ctx) return;
    const orchid = String(req.params.orchid).toUpperCase();
    const payload = (req.body && (req.body as any).payload !== undefined)
      ? (req.body as any).payload
      : req.body;
    try {
      const instance = await DispatcherService.dispatchEvent(
        ctx.organizationId,
        orchid,
        payload,
        { userId: ctx.userId, role: ctx.role }
      );
      return Respond(res, { event: instance }, 201);
    } catch (err) {
      return Respond(res, { message: (err as Error).message }, 500);
    }
  }

  static async getInstance(req: Request, res: Response) {
    try {
      const ctx = await requireOrgMember(req, res);
      if (!ctx) return;
      const id = String(req.params.id);
      const inst = await EventInstanceModel.findOne({
        _id: id,
        organizationId: ctx.organizationId,
      })
        .lean()
        .exec();
      if (!inst) return Respond(res, { message: 'Instance not found' }, 404);
      return Respond(res, { event: inst }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async getInstances(req: Request, res: Response) {
    try {
      const ctx = await requireOrgMember(req, res);
      if (!ctx) return;
      const { page = '1', limit = '20', reference, status } = req.query;
      const q: any = {};
      if (reference) q.reference = String(reference);
      if (status) q.status = String(status);

      const [instances, total] = await Promise.all([
        EventInstanceModel.find({
          ...q,
          organizationId: ctx.organizationId,
        })
          .skip((Number(page) - 1) * Number(limit))
          .limit(Number(limit))
          .lean()
          .exec(),
        EventInstanceModel.countDocuments({
          organizationId: ctx.organizationId,
        }).exec(),
      ]);

      const result = createPaginationResult(
        instances,
        total,
        Number(page),
        Number(limit)
      );
      return Respond(
        res,
        {
          message: 'Instances fetched successfully',
          data: result.data,
          pagination: result.pagination,
        },
        200
      );
    } catch (error) {
      throw error;
    }
  }
}
