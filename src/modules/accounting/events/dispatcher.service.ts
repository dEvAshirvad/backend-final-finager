import { Types } from 'mongoose';
import crypto from 'node:crypto';
import { EventTemplateModel, EventInstanceModel } from './events.model';
import CounterModel from './counter.model';
import { runJournalPlugin } from './plugins/journal.plugin';

function pad(num: number, len: number) {
  return String(num).padStart(len, '0');
}

export default class DispatcherService {
  static async generateReference(orgId: string, orchid: string, cfg: any) {
    const prefix = cfg?.prefix ?? 'DOC';
    const method = cfg?.serialMethod ?? 'incrementor';
    const length = cfg?.length ?? 6;
    if (method === 'randomHex') {
      const bytes = Math.ceil(length / 2);
      const hex = crypto.randomBytes(bytes).toString('hex').slice(0, length);
      return `${prefix}-${hex}`;
    }
    // incrementor using counters collection
    const key = `${orgId}:${orchid}`;
    const counter = await CounterModel.findOneAndUpdate(
      { key },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    ).lean();
    const seq = counter?.seq ?? 1;
    return `${prefix}-${pad(seq, length)}`;
  }

  static async dispatchEvent(
    organizationId: string,
    orchid: string,
    payload: Record<string, any>,
    context: { userId?: string; role?: string }
  ) {
    const tmpl = await EventTemplateModel.findOne({
      organizationId: organizationId,
      orchid: orchid.toUpperCase(),
    })
      .lean()
      .exec();
    if (!tmpl) throw new Error('Template not found');

    // basic payload validation: if inputSchema.required exists (array), ensure fields present
    try {
      const inputSchema = tmpl.inputSchema ?? {};
      const required = Array.isArray(inputSchema.required)
        ? inputSchema.required
        : [];
      const missing = required.filter(
        (f: string) =>
          payload[f] === undefined || payload[f] === null || payload[f] === ''
      );
      if (missing.length) {
        const inst = await EventInstanceModel.create({
          organizationId: new Types.ObjectId(organizationId),
          templateId: tmpl._id,
          type: tmpl.orchid,
          reference: 'PENDING',
          payload,
          status: 'FAILED',
          errorMessage: `Missing required fields: ${missing.join(', ')}`,
        } as any);
        return inst.toObject();
      }
    } catch (err) {
      // proceed, validation not strict for MVP
    }

    const reference = await this.generateReference(
      organizationId,
      tmpl.orchid,
      tmpl.referenceConfig || {}
    );

    const instance = await EventInstanceModel.create({
      organizationId: new Types.ObjectId(organizationId),
      templateId: tmpl._id,
      type: tmpl.orchid,
      reference,
      payload,
      status: 'PENDING',
    } as any);

    const results: any[] = [];
    let finalStatus: 'PROCESSED' | 'FAILED' = 'PROCESSED';
    for (const plugin of tmpl.plugins || ['journal']) {
      try {
        if (plugin === 'journal') {
          const res = await runJournalPlugin(
            tmpl as any,
            instance as any,
            payload,
            { organizationId, userId: context.userId, role: context.role }
          );
          results.push(res);
          if (!res.success) finalStatus = 'FAILED';
        } else {
          results.push({ plugin, success: false, error: 'Unknown plugin' });
          finalStatus = 'FAILED';
        }
      } catch (err) {
        results.push({
          plugin,
          success: false,
          error: (err as Error).message || String(err),
        });
        finalStatus = 'FAILED';
      }
    }

    await EventInstanceModel.findByIdAndUpdate(instance._id, {
      $set: {
        status: finalStatus,
        processedAt: new Date(),
        results,
        errorMessage: results.find((r) => !r.success)?.error ?? null,
      },
    }).exec();

    const updated = await EventInstanceModel.findById(instance._id)
      .lean()
      .exec();
    return updated;
  }
}
