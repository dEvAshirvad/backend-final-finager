import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SortOrder, Types } from 'mongoose';
import {
  COAModel,
  type COA,
  type COACreate,
  type COAUpdate,
} from './coa.model';
import {
  createPaginationResult,
  type PaginationResult,
} from '@/lib/pagination';
import { Session, User } from '@/types/global';
import { JournalEntryModel } from '../journal/journal.model';
import APIError from '@/configs/errors/APIError';

export type COATreeNode = COA & { children: COATreeNode[] };

export default class COAServices {
  static async createAccount(
    data: COACreate,
    userId: string,
    organizationId: string,
    isSystem: boolean = false
  ): Promise<COA> {
    try {
      const doc = await COAModel.create({
        ...data,
        createdBy: userId,
        updatedBy: userId,
        organizationId: organizationId,
        isSystem: isSystem,
      });
      return doc.toObject();
    } catch (error) {
      throw error;
    }
  }

  static async getAccounts(
    query: {
      name?: string;
      code?: string;
      type?: string;
    },
    sort: Record<string, SortOrder>,
    organizationId: string,
    page: number,
    limit: number
  ): Promise<PaginationResult<COA>> {
    try {
      const coaQuery: Record<string, unknown> = {
        organizationId: new Types.ObjectId(organizationId),
      };

      // Check name is number or not if number then search for code else search for name
      if (query.name) {
        if (!isNaN(Number(String(query.name).split(',')[0].trim()))) {
          const codeTokens = query.name
            ?.split(',')
            .filter(Boolean)
            .map((token) => token.trim());
          if (codeTokens?.length) {
            coaQuery.$or = codeTokens.map((token) => ({
              code: { $regex: token, $options: 'i' },
            }));
          }
        } else {
          const nameTokens = query.name
            ?.split(',')
            .filter(Boolean)
            .map((token) => token.trim());
          if (nameTokens?.length) {
            coaQuery.$or = nameTokens.map((token) => ({
              name: { $regex: token, $options: 'i' },
            }));
          }
        }
      }

      const codeTokens = query.code
        ?.split(',')
        .filter(Boolean)
        .map((token) => token.trim());
      if (codeTokens?.length) {
        coaQuery.$or = codeTokens.map((token) => ({
          code: { $regex: token, $options: 'i' },
        }));
      }

      if (query.type) coaQuery.type = query.type;

      const [data, total] = await Promise.all([
        COAModel.find(coaQuery)
          .sort(sort)
          .skip((page - 1) * limit)
          .limit(limit)
          .lean()
          .exec(),
        COAModel.countDocuments({ organizationId }).exec(),
      ]);

      return createPaginationResult<COA>(data as COA[], total, page, limit);
    } catch (error) {
      throw error;
    }
  }

  static async getAccountById(
    id: string,
    organizationId: string
  ): Promise<COA | null> {
    try {
      if (!Types.ObjectId.isValid(id)) return null;
      const doc = await COAModel.findOne({
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
      } as object)
        .lean()
        .exec();
      return doc ? (doc as COA) : null;
    } catch (error) {
      throw error;
    }
  }

  static async getAccountByCode(
    organizationId: string,
    code: string
  ): Promise<COA | null> {
    try {
      const doc = await COAModel.findOne({
        organizationId,
        code,
      }).exec();
      return doc ? doc.toObject() : null;
    } catch (error) {
      throw error;
    }
  }

  static async updateAccount(
    id: string,
    data: COAUpdate,
    user: User,
    session: Session
  ): Promise<{
    old: COA;
    new: COA;
    changes: Record<string, { from: unknown; to: unknown }>;
    matchedCount: number;
    modifiedCount: number;
  } | null> {
    try {
      if (!Types.ObjectId.isValid(id)) return null;

      const filter = {
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(session.activeOrganizationId!),
      } as Record<string, unknown>;

      const updatePayload = {
        ...data,
        updatedBy: new Types.ObjectId(user.id),
      };

      // returnDocument: 'before' = return document BEFORE update (old); update still runs
      const oldDoc = await COAModel.findOneAndUpdate(
        filter,
        { $set: updatePayload },
        { returnDocument: 'before', lean: true }
      ).exec();

      if (!oldDoc) return null;

      const oldObj = oldDoc as Record<string, unknown>;
      const payload = updatePayload as Record<string, unknown>;
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      const omit = new Set(['__v', 'updatedAt', 'updatedBy']);

      for (const key of Object.keys(data)) {
        if (omit.has(key)) continue;
        const from = oldObj[key];
        const to = payload[key];
        if (JSON.stringify(from) !== JSON.stringify(to)) {
          changes[key] = { from, to };
        }
      }

      const modifiedCount = Object.keys(changes).length > 0 ? 1 : 0;
      const newDoc = modifiedCount > 0 ? { ...oldObj, ...payload } : oldObj;

      return {
        old: oldObj as COA,
        new: newDoc as COA,
        changes,
        matchedCount: 1,
        modifiedCount,
      };
    } catch (error) {
      throw error;
    }
  }

  static async patchAccount(
    id: string,
    data: Partial<COAUpdate>,
    userId?: string,
    organizationId?: string
  ): Promise<{
    old: COA;
    new: COA;
    changes: Record<string, { from: unknown; to: unknown }>;
    matchedCount: number;
    modifiedCount: number;
  } | null> {
    try {
      if (!Types.ObjectId.isValid(id)) return null;

      const filter = organizationId
        ? ({
            _id: new Types.ObjectId(id),
            organizationId: new Types.ObjectId(organizationId),
          } as Record<string, unknown>)
        : { _id: new Types.ObjectId(id) };

      const updatePayload = {
        ...data,
        updatedBy: userId ? new Types.ObjectId(userId) : undefined,
      };

      const oldDoc = await COAModel.findOneAndUpdate(
        filter,
        { $set: updatePayload },
        { returnDocument: 'before', lean: true }
      ).exec();

      if (!oldDoc) return null;

      const oldObj = oldDoc as Record<string, unknown>;
      const payload = updatePayload as Record<string, unknown>;
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      const omit = new Set(['__v', 'updatedAt', 'updatedBy']);

      for (const key of Object.keys(data)) {
        if (omit.has(key)) continue;
        const from = oldObj[key];
        const to = payload[key];
        if (JSON.stringify(from) !== JSON.stringify(to)) {
          changes[key] = { from, to };
        }
      }

      const modifiedCount = Object.keys(changes).length > 0 ? 1 : 0;
      const newDoc = modifiedCount > 0 ? { ...oldObj, ...payload } : oldObj;

      return {
        old: oldObj as COA,
        new: newDoc as COA,
        changes,
        matchedCount: 1,
        modifiedCount,
      };
    } catch (error) {
      throw error;
    }
  }

  static async deleteAccount(
    id: string,
    organizationId: string
  ): Promise<boolean> {
    try {
      if (!Types.ObjectId.isValid(id)) return false;
      const result = await COAModel.findOneAndDelete({
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
        isSystem: false,
      } as Record<string, unknown>).exec();
      return Boolean(result);
    } catch (error) {
      throw error;
    }
  }

  static getTemplateByIndustry(
    industry: 'retail' | 'serviceBased' | 'manufacturing'
  ): COACreate[] {
    const templatePath = join(__dirname, 'coa.template.json');
    const raw = readFileSync(templatePath, 'utf-8');
    const templateData = JSON.parse(raw) as Record<string, COACreate[]>;
    const accounts = templateData[industry];
    if (!Array.isArray(accounts)) return [];
    return accounts;
  }

  static async createFromTemplate(params: {
    organizationId: string;
    userId?: string;
    accounts: COACreate[];
    isSystem?: boolean;
  }): Promise<COA[]> {
    try {
      const { organizationId, userId, accounts, isSystem = false } = params;

      const docs = await COAModel.insertMany(
        accounts.map((acc: COACreate & { isSystem?: boolean }) => ({
          ...acc,
          organizationId: new Types.ObjectId(organizationId),
          createdBy: userId ? new Types.ObjectId(userId) : undefined,
          updatedBy: userId ? new Types.ObjectId(userId) : undefined,
          isSystem: isSystem,
        }))
      );

      return docs.map((d) => d.toObject());
    } catch (error) {
      // MongoDB E11000 = duplicate key on unique index (organizationId_1_code_1)
      const mongoError = error as { code?: number };
      if (mongoError.code === 11000) {
        throw new APIError({
          STATUS: 409,
          TITLE: 'Duplicate Account Code',
          MESSAGE:
            'One or more account codes already exist for this organization. Each code must be unique within an organization.',
        });
      }
      throw error;
    }
  }

  // -------- Tree helpers --------

  private static buildTree(accounts: COA[]): COATreeNode[] {
    try {
      const map = new Map<string, COATreeNode>();
      const roots: COATreeNode[] = [];

      for (const acc of accounts) {
        map.set(acc.code, { ...acc, children: [] });
      }

      for (const node of map.values()) {
        if (node.parentCode) {
          const parent = map.get(node.parentCode);
          if (parent) {
            parent.children.push(node);
          } else {
            roots.push(node);
          }
        } else {
          roots.push(node);
        }
      }

      return roots;
    } catch (error) {
      throw error;
    }
  }

  static async getFullTree(organizationId: string): Promise<COATreeNode[]> {
    try {
      const accounts = await COAModel.find({
        organizationId,
      })
        .sort({ code: 1 })
        .lean()
        .exec();

      return this.buildTree(accounts);
    } catch (error) {
      throw error;
    }
  }

  static async getRootAccounts(organizationId: string): Promise<COA[]> {
    try {
      const docs = await COAModel.find({
        organizationId,
        $or: [{ parentCode: null }, { parentCode: { $exists: false } }],
      })
        .sort({ code: 1 })
        .exec();

      return docs;
    } catch (error) {
      throw error;
    }
  }

  static async getLeafAccounts(organizationId: string): Promise<COA[]> {
    try {
      const accounts = await COAModel.find({
        organizationId,
      }).exec();

      const parentCodes = new Set(
        accounts.map((a) => a.parentCode).filter((c): c is string => Boolean(c))
      );

      return accounts.filter((a) => !parentCodes.has(a.code));
    } catch (error) {
      throw error;
    }
  }

  // -------- Hierarchy navigation --------

  static async getAncestors(
    organizationId: string,
    accountId: string
  ): Promise<COA[]> {
    try {
      const account = await this.getAccountById(
        accountId as string,
        organizationId
      );
      if (!account) return [];

      const all = await COAModel.find({
        organizationId,
      }).exec();

      const byCode = new Map(all.map((a) => [a.code, a]));
      const ancestors: COA[] = [];
      let currentParentCode = account.parentCode ?? undefined;

      while (currentParentCode) {
        const parent = byCode.get(currentParentCode);
        if (!parent) break;
        ancestors.unshift(parent);
        currentParentCode = parent.parentCode ?? undefined;
      }

      return ancestors;
    } catch (error) {
      throw error;
    }
  }

  static async getDescendants(
    organizationId: string,
    accountId: string,
    includeSelf = false
  ): Promise<COA[]> {
    const account = await this.getAccountById(accountId, organizationId);
    if (!account) return [];

    const all = (await COAModel.find({
      organizationId: new Types.ObjectId(organizationId),
    } as object)
      .lean()
      .exec()) as (COA & { code: string; parentCode?: string })[];

    const childrenByParent = new Map<string, (COA & { code: string })[]>();
    for (const acc of all) {
      if (!acc.parentCode) continue;
      const arr = childrenByParent.get(acc.parentCode) ?? [];
      arr.push(acc);
      childrenByParent.set(acc.parentCode, arr);
    }

    const descendants: (COA & { code: string })[] = [];
    const stack = [...(childrenByParent.get(account.code) ?? [])];

    while (stack.length) {
      const node = stack.pop()!;
      descendants.push(node);
      const children = childrenByParent.get(node.code) ?? [];
      stack.push(...children);
    }

    if (includeSelf) {
      return [account, ...descendants];
    }
    return descendants;
  }

  static async getChildren(
    organizationId: string,
    accountId: string
  ): Promise<COA[]> {
    const account = await this.getAccountById(accountId, organizationId);
    if (!account) return [];

    const docs = await COAModel.find({
      organizationId,
      parentCode: account.code,
    })
      .sort({ code: 1 })
      .exec();

    return docs;
  }

  static async getPath(
    organizationId: string,
    accountId: string
  ): Promise<COA[]> {
    const account = await this.getAccountById(accountId, organizationId);
    if (!account) return [];

    const ancestors = await this.getAncestors(organizationId, accountId);
    return [...ancestors, account];
  }

  static async getLevel(
    organizationId: string,
    accountId: string
  ): Promise<number> {
    const path = await this.getPath(organizationId, accountId);
    // Level = depth, root level = 0
    return path.length > 0 ? path.length - 1 : 0;
  }

  static async moveAccount(
    organizationId: string,
    accountId: string,
    newParentCode: string | null,
    userId?: string
  ): Promise<COA | null> {
    const account = await this.getAccountById(accountId, organizationId);
    if (!account) return null;

    if (newParentCode === account.code) {
      throw new Error('Account cannot be its own parent');
    }

    if (newParentCode) {
      const descendants = await this.getDescendants(organizationId, accountId);
      const descendantCodes = new Set(descendants.map((d) => d.code));
      if (descendantCodes.has(newParentCode)) {
        throw new Error('Cannot move account under its own descendant');
      }
    }

    const result = await this.patchAccount(
      accountId,
      { parentCode: newParentCode },
      userId,
      organizationId
    );
    return result?.new ?? null;
  }

  // -------- Statistics --------

  static async getOverviewStatistics(organizationId: string): Promise<{
    total: number;
    byType: Record<string, number>;
    rootCount: number;
    leafCount: number;
  }> {
    const organizationObjectId = new Types.ObjectId(organizationId);
    const [total, byTypeAgg, roots, leaves] = await Promise.all([
      COAModel.countDocuments({ organizationId }),
      COAModel.aggregate([
        { $match: { organizationId } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
      COAModel.countDocuments({
        organizationId,
        $or: [{ parentCode: null }, { parentCode: { $exists: false } }],
      }),
      // Leaf accounts = no children
      COAModel.aggregate([
        { $match: { organizationId: organizationObjectId } },
        {
          $lookup: {
            from: 'coas',
            localField: 'code',
            foreignField: 'parentCode',
            as: 'children',
          },
        },
        { $match: { children: { $size: 0 } } },
        { $count: 'leafCount' },
      ]),
    ]);

    const byType: Record<string, number> = {};
    for (const row of byTypeAgg as { _id: string; count: number }[]) {
      byType[row._id] = row.count;
    }

    const leafCount =
      (leaves[0] as { leafCount: number } | undefined)?.leafCount ?? 0;

    return {
      total,
      byType,
      rootCount: roots,
      leafCount,
    };
  }

  // -------- Journal Entries --------

  static async getJournalEntriesForAccount({
    accountId,
    organizationId,
    page = 1,
    limit = 10,
    status,
    dateFrom,
    dateTo,
  }: {
    accountId: string;
    organizationId: string;
    page?: number;
    limit?: number;
    status?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }) {
    try {
      const account = await COAModel.findOne({
        _id: new Types.ObjectId(accountId),
        organizationId: new Types.ObjectId(organizationId),
      } as Record<string, unknown>)
        .lean()
        .exec();

      if (!account) {
        throw new APIError({
          STATUS: 404,
          TITLE: 'Account Not Found',
          MESSAGE: 'Account not found or access denied',
        });
      }

      const descendants = await this.getDescendants(
        organizationId,
        accountId,
        true
      );
      const allAccountIds = descendants
        .map((acc) => (acc as { _id?: Types.ObjectId })._id?.toString())
        .filter(Boolean) as string[];

      const query: Record<string, unknown> = {
        organizationId,
        'lines.accountId': {
          $in: allAccountIds.map((id) => new Types.ObjectId(id)),
        },
      };

      if (status) {
        query.status = status;
      }

      if (dateFrom || dateTo) {
        query.date = {};
        if (dateFrom) (query.date as Record<string, Date>).$gte = dateFrom;
        if (dateTo) (query.date as Record<string, Date>).$lte = dateTo;
      }

      const allJournalEntries = (await JournalEntryModel.find(query)
        .sort({ date: -1, createdAt: -1 })
        .lean()
        .exec()) as unknown as {
        _id: Types.ObjectId;
        lines: {
          accountId: Types.ObjectId;
          debit?: number;
          credit?: number;
          narration?: string;
        }[];
        [k: string]: unknown;
      }[];

      const accountInfoMap = new Map(
        descendants.map((acc) => {
          const id = (acc as { _id?: Types.ObjectId })._id?.toString();
          return [
            id,
            {
              _id: id,
              name: (acc as { name?: string }).name,
              code: (acc as { code?: string }).code,
              type: (acc as { type?: string }).type,
            },
          ];
        })
      );

      const filteredEntries = allJournalEntries
        .map((entry) => ({
          ...entry,
          lines: entry.lines
            .filter((line) => {
              const lineAccountId = line.accountId?.toString();
              return lineAccountId && allAccountIds.includes(lineAccountId);
            })
            .map((line) => ({
              ...line,
              accountInfo: accountInfoMap.get(line.accountId?.toString() ?? ''),
            })),
        }))
        .filter((entry) => entry.lines.length > 0);

      const totalDocs = filteredEntries.length;
      const skip = (page - 1) * limit;
      const paginatedEntries = filteredEntries.slice(skip, skip + limit);

      return {
        account: {
          _id: (account as { _id: Types.ObjectId })._id.toString(),
          name: (account as { name?: string }).name,
          code: (account as { code?: string }).code,
          type: (account as { type?: string }).type,
        },
        descendantAccounts: descendants.map((acc) => ({
          _id: (acc as { _id?: Types.ObjectId })._id?.toString(),
          name: (acc as { name?: string }).name,
          code: (acc as { code?: string }).code,
          type: (acc as { type?: string }).type,
        })),
        journalEntries: paginatedEntries,
        totalDocs,
        limit,
        page,
        totalPages: Math.ceil(totalDocs / limit),
        nextPage: page < Math.ceil(totalDocs / limit),
        prevPage: page > 1,
      };
    } catch (error) {
      throw error;
    }
  }
}
