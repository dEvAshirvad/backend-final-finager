import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Types } from 'mongoose';
import { EventTemplateModel } from './events.model';
import type { EventTemplate } from './events.model';
import APIError from '@/configs/errors/APIError';

export type EventTemplateIndustry = 'retail' | 'serviceBased' | 'manufacturing';

export default class EventTemplateService {
  static async createTemplate(
    data: Partial<EventTemplate>,
    organizationId: string
  ) {
    // Resolve any account codes in linesRule to accountIds
    const { COAModel } = await import('@/modules/accounting/coa/coa.model');
    const lines = (data.linesRule ?? []) as any[];
    for (const line of lines) {
      // support `accountCode` (preferred) or `accountId` (legacy)
      const accountCode =
        line.accountCode ?? line.accountCode?.toString?.() ?? null;
      const accountRef = line.accountId ?? null;
      if (accountCode) {
        const acc = await (COAModel as any)
          .findOne({
            organizationId: new Types.ObjectId(organizationId),
            code: String(accountCode),
          })
          .lean()
          .exec();
        if (!acc) {
          throw new APIError({
            STATUS: 400,
            TITLE: 'Account Not Found',
            MESSAGE: `Account with code ${accountCode} not found in organization`,
          });
        }
        line.accountId = acc._id;
        delete line.accountCode;
      } else if (accountRef) {
        // if accountId provided but not a valid ObjectId, try treat as code
        if (!Types.ObjectId.isValid(String(accountRef))) {
          const acc = await (COAModel as any)
            .findOne({
              organizationId: new Types.ObjectId(organizationId),
              code: String(accountRef),
            })
            .lean()
            .exec();
          if (!acc) {
            throw new APIError({
              STATUS: 400,
              TITLE: 'Account Not Found',
              MESSAGE: `Account with code ${accountRef} not found in organization`,
            });
          }
          line.accountId = acc._id;
        }
      } else {
        throw new APIError({
          STATUS: 400,
          TITLE: 'Invalid Template Line',
          MESSAGE: 'Each linesRule must include accountCode or accountId',
        });
      }
    }

    const doc = await EventTemplateModel.create({
      ...data,
      linesRule: lines,
      organizationId: new Types.ObjectId(organizationId),
    } as any);
    return doc.toObject() as unknown as EventTemplate;
  }

  /**
   * Create multiple templates in a single call.
   * Resolves `accountCode` (or non-objectId `accountId`) to COA _id for each lineRule.
   * Useful for org setup. Returns created templates and failures.
   */
  static async createManyTemplates(
    templates: Partial<EventTemplate>[],
    organizationId: string,
    opts?: { systemGenerated?: boolean }
  ) {
    const { COAModel } = await import('@/modules/accounting/coa/coa.model');
    const created: EventTemplate[] = [];
    const failures: { index: number; error: string }[] = [];

    for (let i = 0; i < templates.length; i++) {
      const t = { ...templates[i] } as Partial<EventTemplate>;
      const lines = (t.linesRule ?? []) as any[];
      try {
        for (const line of lines) {
          const accountCode =
            line.accountCode ?? line.accountCode?.toString?.() ?? null;
          const accountRef = line.accountId ?? null;
          if (accountCode) {
            const acc = await (COAModel as any)
              .findOne({
                organizationId: new Types.ObjectId(organizationId),
                code: String(accountCode),
              })
              .lean()
              .exec();
            if (!acc) {
              throw new APIError({
                STATUS: 400,
                TITLE: 'Account Not Found',
                MESSAGE: `Account with code ${accountCode} not found in organization`,
              });
            }
            line.accountId = acc._id;
            delete line.accountCode;
          } else if (accountRef) {
            if (!Types.ObjectId.isValid(String(accountRef))) {
              const acc = await (COAModel as any)
                .findOne({
                  organizationId: new Types.ObjectId(organizationId),
                  code: String(accountRef),
                })
                .lean()
                .exec();
              if (!acc) {
                throw new APIError({
                  STATUS: 400,
                  TITLE: 'Account Not Found',
                  MESSAGE: `Account with code ${accountRef} not found in organization`,
                });
              }
              line.accountId = acc._id;
            }
          } else {
            throw new APIError({
              STATUS: 400,
              TITLE: 'Invalid Template Line',
              MESSAGE: 'Each linesRule must include accountCode or accountId',
            });
          }
        }

        const doc = await EventTemplateModel.create({
          ...t,
          linesRule: lines,
          organizationId: new Types.ObjectId(organizationId),
          isSystemGenerated: opts?.systemGenerated ?? (t.isSystemGenerated ?? false),
        } as any);
        created.push(doc.toObject() as unknown as EventTemplate);
      } catch (err) {
        const msg =
          err instanceof APIError
            ? err.message
            : (err as Error)?.message ?? String(err);
        failures.push({ index: i, error: msg });
      }
    }

    return { created, failures };
  }

  static async getByOrchid(organizationId: string, orchid: string) {
    return (await EventTemplateModel.findOne({
      organizationId: organizationId,
      orchid: orchid.toUpperCase(),
    })
      .lean()
      .exec()) as unknown as EventTemplate | null;
  }

  static async list(
    organizationId: string,
    query: Record<string, unknown> = {},
    page = 1,
    limit = 20
  ) {
    const q: any = {
      organizationId: new Types.ObjectId(organizationId),
      ...query,
    };
    const [data, total] = await Promise.all([
      EventTemplateModel.find(q)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      EventTemplateModel.countDocuments(q).exec(),
    ]);
    return { data: data as EventTemplate[], total };
  }

  static async updateByOrchid(
    organizationId: string,
    orchid: string,
    patch: Partial<EventTemplate>
  ) {
    const doc = await EventTemplateModel.findOneAndUpdate(
      { organizationId: organizationId, orchid: orchid.toUpperCase() },
      { $set: patch },
      { new: true, runValidators: true }
    )
      .lean()
      .exec();
    return doc as unknown as EventTemplate | null;
  }

  static async deleteByOrchid(organizationId: string, orchid: string) {
    // Prevent deleting system-generated templates
    const existing = await EventTemplateModel.findOne({
      organizationId: organizationId,
      orchid: orchid.toUpperCase(),
    })
      .lean()
      .exec();
    if (!existing) return null;
    if ((existing as any).isSystemGenerated) {
      throw new APIError({
        STATUS: 403,
        TITLE: 'Forbidden',
        MESSAGE: 'System-generated templates cannot be deleted',
      });
    }
    const doc = await EventTemplateModel.findOneAndUpdate(
      { organizationId: organizationId, orchid: orchid.toUpperCase() },
      { $set: { isActive: false } },
      { new: true }
    )
      .lean()
      .exec();
    return doc as unknown as EventTemplate | null;
  }

  /**
   * Load event templates for an industry from events.template.json.
   * Same structure as COA: industry key → array of template definitions (with accountCode in linesRule).
   * For now all industries share the same set; later can differ per industry.
   */
  static getTemplateByIndustry(
    industry: EventTemplateIndustry
  ): Partial<EventTemplate>[] {
    const templatePath = join(__dirname, 'events.template.json');
    const raw = readFileSync(templatePath, 'utf-8');
    const templateData = JSON.parse(raw) as Record<
      EventTemplateIndustry,
      Partial<EventTemplate>[]
    >;
    const templates = templateData[industry];
    if (!Array.isArray(templates)) return [];
    return templates;
  }

  /**
   * Create event templates for an organization from the industry template.
   * Skips orchids that already exist. Resolves accountCode → accountId per org. Marks as system-generated.
   */
  static async createFromTemplate(params: {
    organizationId: string;
    industry: EventTemplateIndustry;
  }): Promise<{
    created: EventTemplate[];
    failures: { orchid: string; error: string }[];
  }> {
    const { organizationId, industry } = params;
    const templates = this.getTemplateByIndustry(industry);
    if (templates.length === 0) return { created: [], failures: [] };

    const filter: any = {
      organizationId: new Types.ObjectId(organizationId),
      orchid: { $in: templates.map((t) => (t.orchid ?? '').toUpperCase()) },
    };
    const existing = await EventTemplateModel.find(filter)
      .lean()
      .exec();
    const existingSet = new Set((existing as any[]).map((t) => t.orchid));

    const toCreate = templates.filter(
      (t) => !existingSet.has((t.orchid ?? '').toUpperCase())
    ) as Partial<EventTemplate>[];
    if (toCreate.length === 0) return { created: [], failures: [] };

    const { created, failures } = await this.createManyTemplates(
      toCreate,
      organizationId,
      { systemGenerated: true }
    );

    return {
      created,
      failures: failures.map((f) => ({
        orchid: toCreate[f.index]?.orchid ?? '',
        error: f.error,
      })),
    };
  }
}
