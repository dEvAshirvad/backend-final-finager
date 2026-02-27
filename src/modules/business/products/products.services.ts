import { Types } from 'mongoose';
import fs from 'node:fs';
import {
  ProductModel,
  type Product,
  type ProductCreate,
  type ProductUpdate,
} from './products.model';
import {
  createPaginationResult,
  type PaginationResult,
} from '@/lib/pagination';
import {
  generateVariantCombinations,
  generateSkuCode,
  formatVariantCombo,
} from '@/lib/variants';

/** CSV variants column format: each variant is "part1-%-part2-%-...-%-qty"; multiple variants comma-separated. Example: orange-%-M-%-3,orange-%-L-%-7 */
export const CSV_VARIANT_SEP = '-%-';

/** Parse variants from CSV cell: "part1-%-part2-%-qty,part1-%-part2-%-qty" → [{ variant: "part1-part2", qty: n }, ...]. Falls back to JSON parse if cell does not contain CSV_VARIANT_SEP. */
export function parseVariantsFromCsvCell(cell: string): { variant: string; qty: number }[] | Record<string, string[]> | undefined {
  const s = String(cell ?? '').trim();
  if (!s) return undefined;
  if (s.includes(CSV_VARIANT_SEP)) {
    const variants: { variant: string; qty: number }[] = [];
    const tokens = s.split(',').map((t) => t.trim()).filter(Boolean);
    for (const token of tokens) {
      const parts = token.split(CSV_VARIANT_SEP);
      if (parts.length < 2) continue;
      const qtyPart = parts[parts.length - 1];
      const qty = Number(qtyPart);
      if (Number.isNaN(qty) || qty < 0) continue;
      const variantCombo = parts.slice(0, -1).join('-');
      if (variantCombo) variants.push({ variant: variantCombo, qty });
    }
    return variants.length ? variants : undefined;
  }
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed as { variant: string; qty: number }[];
    if (parsed && typeof parsed === 'object') return parsed as Record<string, string[]>;
  } catch {
    /* ignore */
  }
  return undefined;
}

/** Escape a CSV cell: wrap in quotes and escape " as "" if value contains comma, quote, or newline. */
function csvEscape(val: string): string {
  const s = String(val ?? '');
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

function computeVirtuals(prod: any) {
  const p = { ...prod };
  const variants = Array.isArray(p.variants) ? p.variants : [];
  const isInventory = p.isInventoryItem !== false;
  const currentQty = isInventory
    ? variants.reduce((s: number, v: any) => s + (Number(v.qty) || 0), 0)
    : 0;
  const totalCostValue = isInventory
    ? variants.reduce(
        (s: number, v: any) =>
          s +
          (Number(v.qty) || 0) *
            (Number(v.costPrice) || Number(p.costPrice) || 0),
        0
      )
    : 0;
  const avgCost = currentQty > 0 ? totalCostValue / currentQty : 0;
  const totalStock = variants.reduce(
    (s: number, v: any) => s + (Number(v.qty) || 0),
    0
  );
  p.currentQty = currentQty;
  p.totalCostValue = totalCostValue;
  p.avgCost = avgCost;
  p.totalStock = totalStock;
  return p;
}

export default class ProductServices {
  static async create(
    data: ProductCreate,
    organizationId: string,
    userId?: string
  ): Promise<Product> {
    try {
      const orgId = new Types.ObjectId(organizationId);
      const rawVariants = (data as any).variants;
      let variantsArray:
        | {
            variant: string;
            qty?: number;
            skuCode?: string;
            costPrice?: number;
            sellingPrice?: number;
          }[]
        | undefined;

      if (Array.isArray(rawVariants)) {
        variantsArray = rawVariants as any[];
      } else if (rawVariants && typeof rawVariants === 'object') {
        // legacy: object map { color: [...], size: [...] } -> generate combos
        const combos = generateVariantCombinations(rawVariants);
        variantsArray = combos.map((c: string[]) => ({
          variant: formatVariantCombo(c),
          qty: 0,
        }));
      }

      let sku:
        | {
            variantCombo?: string;
            skuCode: string;
            qty: number;
            costPrice?: number;
          }[]
        | undefined = undefined;

      const isInventoryItem = (data as any).isInventoryItem ?? true;
      // Ensure variants carry skuCode, costPrice and sellingPrice defaults
      if (Array.isArray(variantsArray) && variantsArray.length) {
        for (const v of variantsArray) {
          v.variant = String(v.variant);
          v.qty = Number(v.qty ?? 0);
          if (!v.skuCode)
            v.skuCode = generateSkuCode(
              data.name,
              String(v.variant),
              organizationId
            );
          if (v.costPrice === undefined || v.costPrice === null)
            v.costPrice = data.costPrice ?? undefined;
          if (v.sellingPrice === undefined || v.sellingPrice === null)
            v.sellingPrice = data.sellingPrice ?? undefined;
        }
        if (isInventoryItem) {
          sku = variantsArray.map((v) => ({
            variantCombo: String(v.variant),
            skuCode: v.skuCode!,
            qty: Number(v.qty ?? 0),
            costPrice: v.costPrice ?? data.costPrice ?? undefined,
          }));
        }
      }

      const doc = await ProductModel.create({
        ...data,
        variants: Array.isArray(variantsArray) ? variantsArray : data.variants,
        organizationId: orgId,
        ...(userId && {
          createdBy: new Types.ObjectId(userId),
          updatedBy: new Types.ObjectId(userId),
        }),
      } as any);
      return doc.toObject() as unknown as Product;
    } catch (error) {
      throw error;
    }
  }

  static async list(
    filters: {
      search?: string;
      category?: string;
      tags?: string[];
      isActive?: boolean;
    },
    sort: Record<string, 1 | -1>,
    organizationId: string,
    page: number,
    limit: number
  ): Promise<PaginationResult<Product>> {
    const query: Record<string, any> = {
      organizationId: new Types.ObjectId(organizationId),
    };
    if (filters.category) query.category = filters.category;
    if (filters.isActive !== undefined) query.isActive = filters.isActive;
    if (filters.tags && filters.tags.length) query.tags = { $in: filters.tags };

    if (filters.search) {
      const tokens = String(filters.search)
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      // build $and of token checks (name or sku.variantCombo)
      query.$and = tokens.map((t) => ({
        $or: [
          { name: { $regex: t, $options: 'i' } },
          { 'variants.variant': { $regex: t, $options: 'i' } },
        ],
      }));
    }

    const [data, total] = await Promise.all([
      ProductModel.find(query)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      ProductModel.countDocuments(query).exec(),
    ]);
    const mapped = (data as any[]).map((d) => computeVirtuals(d));
    return createPaginationResult<Product>(
      mapped as unknown as Product[],
      total,
      page,
      limit
    );
  }

  static async getById(
    id: string,
    organizationId: string
  ): Promise<Product | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await ProductModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    })
      .lean()
      .exec();
    if (!doc) return null;
    return computeVirtuals(doc) as Product;
  }

  static async adjustStock(
    id: string,
    organizationId: string,
    userId: string | undefined,
    opts: {
      type: 'STOCK_IN' | 'STOCK_OUT' | 'STOCK_ADJUSTED';
      variant?: string;
      qty: number;
      reason?: string;
      costPrice?: number;
    }
  ): Promise<Product | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const prod = await ProductModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    })
      .lean()
      .exec();
    if (!prod) return null;

    const variants = Array.isArray(prod.variants) ? [...prod.variants] : [];
    const variantKey = opts.variant ? String(opts.variant) : undefined;
    let foundIndex = -1;
    if (variantKey) {
      foundIndex = variants.findIndex((v: any) => v.variant === variantKey);
    } else {
      // no variant specified — adjust overall stock by the first variant (not ideal)
      foundIndex = variants.length ? 0 : -1;
    }

    if (foundIndex === -1) {
      // if STOCK_IN or STOCK_ADJUSTED, create new variant entry
      if (opts.type === 'STOCK_IN' || opts.type === 'STOCK_ADJUSTED') {
        const newVariant = {
          variant: variantKey ?? `default-${Date.now()}`,
          qty: opts.type === 'STOCK_IN' ? opts.qty : opts.qty,
          skuCode: generateSkuCode(
            prod.name || 'P',
            variantKey ?? `default-${Date.now()}`,
            organizationId
          ),
          costPrice: opts.costPrice ?? prod.costPrice ?? undefined,
        } as any;
        variants.push(newVariant);
        foundIndex = variants.length - 1;
      } else {
        throw new Error('Variant not found for STOCK_OUT');
      }
    } else {
      // mutate existing
      const existing = variants[foundIndex] as any;
      if (opts.type === 'STOCK_IN') {
        existing.qty = Number(existing.qty || 0) + Number(opts.qty);
        if (opts.costPrice !== undefined) existing.costPrice = opts.costPrice;
      } else if (opts.type === 'STOCK_OUT') {
        const newQty = Number(existing.qty || 0) - Number(opts.qty);
        if (newQty < 0) {
          throw new Error('Insufficient stock for STOCK_OUT');
        }
        existing.qty = newQty;
      } else if (opts.type === 'STOCK_ADJUSTED') {
        existing.qty = Number(opts.qty);
        if (opts.costPrice !== undefined) existing.costPrice = opts.costPrice;
      }
      variants[foundIndex] = existing;
    }

    const update: any = { variants };
    if (userId) update.updatedBy = new Types.ObjectId(userId);

    const updated = await ProductModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
      },
      { $set: update },
      { new: true, runValidators: true }
    )
      .lean()
      .exec();
    if (!updated) return null;

    return computeVirtuals(updated) as Product;
  }

  static async update(
    id: string,
    data: ProductUpdate,
    organizationId: string,
    userId?: string
  ): Promise<Product | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const existing = await ProductModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    })
      .lean()
      .exec();
    if (!existing) return null;
    const update: Record<string, any> = { ...data };
    if (userId) update.updatedBy = new Types.ObjectId(userId);

    // handle variants merge & sku regen while preserving qty/skuCode
    if ((data as any).variants) {
      const rawNew = (data as any).variants;
      let newVariantsArray:
        | {
            variant: string;
            qty?: number;
            skuCode?: string;
            costPrice?: number;
            sellingPrice?: number;
          }[]
        | undefined;
      if (Array.isArray(rawNew)) {
        newVariantsArray = rawNew as any[];
      } else if (rawNew && typeof rawNew === 'object') {
        const combos = generateVariantCombinations(rawNew);
        newVariantsArray = combos.map((c: string[]) => ({
          variant: formatVariantCombo(c),
          qty: 0,
        }));
      }
      const shouldBeInventory =
        (data as any).isInventoryItem ??
        (existing as any).isInventoryItem ??
        true;
      if (shouldBeInventory && Array.isArray(newVariantsArray)) {
        const existingVariants = (existing as any).variants ?? [];
        // normalize and default fields
        for (const v of newVariantsArray) {
          v.variant = String(v.variant);
          v.qty = Number(v.qty ?? 0);
          const found = existingVariants.find(
            (s: any) => s.variant === v.variant
          );
          if (!v.skuCode) {
            v.skuCode =
              v.skuCode ??
              found?.skuCode ??
              generateSkuCode(
                (data as any).name || (existing as any).name,
                v.variant,
                String((existing as any).organizationId)
              );
          }
          if (v.costPrice === undefined || v.costPrice === null) {
            v.costPrice =
              v.costPrice ??
              found?.costPrice ??
              (data as any).costPrice ??
              (existing as any).costPrice;
          }
          if (v.sellingPrice === undefined || v.sellingPrice === null) {
            v.sellingPrice =
              v.sellingPrice ??
              (data as any).sellingPrice ??
              (existing as any).sellingPrice;
          }
        }
        update.variants = newVariantsArray;
      } else if (!shouldBeInventory) {
        update.variants = newVariantsArray ?? [];
      }
    }

    const doc = await ProductModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
      },
      { $set: update },
      { new: true, runValidators: true }
    )
      .lean()
      .exec();
    return doc as unknown as Product | null;
  }

  static async remove(id: string, organizationId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    // Soft delete
    const res = await ProductModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
      },
      { $set: { isActive: false } }
    ).exec();
    return res != null;
  }

  static getTemplateCsvBuffer(): Buffer {
    const headers = [
      'name',
      'variants',
      'hsnOrSacCode',
      'isInventoryItem',
      'productType',
      'bom',
      'gstRate',
      'category',
      'unit',
      'costPrice',
      'sellingPrice',
      'lowStockThreshold',
      'tags',
      'notes',
      'isActive',
    ];
    // Variants: comma-separated entries, each "part1-%-part2-%-...-%-qty" (e.g. orange-%-M-%-3,orange-%-L-%-7)
    const variantsExample = 'orange-%-M-%-3,orange-%-L-%-7';
    const exampleRow = [
      csvEscape('Plain Shirt'),
      csvEscape(variantsExample),
      csvEscape('6109'),
      csvEscape('true'),
      csvEscape('FINISHED'),
      csvEscape(''),
      csvEscape('12'),
      csvEscape('apparel'),
      csvEscape('pcs'),
      csvEscape('200'),
      csvEscape('350'),
      csvEscape('10'),
      csvEscape('mens,summer'),
      csvEscape('Example note'),
      csvEscape('true'),
    ];
    const lines = [headers.join(','), exampleRow.join(',')];
    return Buffer.from(lines.join('\n'), 'utf-8');
  }

  static parseCsvFile(filePath: string): Record<string, unknown>[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = parseCsvLine(lines[0]!);
    const rows: Record<string, unknown>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]!);
      const obj: Record<string, unknown> = {};
      headers.forEach((h, j) => {
        obj[h] = values[j] ?? '';
      });
      rows.push(obj);
    }
    return rows;
  }

  /** Build variants array and sku from CSV variants (object or array). Preserve existing qty/skuCode when updating. */
  static buildVariantsAndSkuFromCsv(
    variantsRaw: Record<string, string[]> | Array<{ variant: string; qty?: number; skuCode?: string; costPrice?: number }> | undefined,
    name: string,
    organizationId: string,
    productLevelCost?: number,
    productLevelSelling?: number,
    existingVariants?: { variant: string; qty?: number; skuCode?: string; costPrice?: number }[],
    isInventoryItem = true
  ): {
    variants: { variant: string; qty: number; skuCode: string; costPrice?: number; sellingPrice?: number }[];
    sku: { variantCombo: string; skuCode: string; qty: number; costPrice?: number }[];
  } {
    let variantsArray: { variant: string; qty: number; skuCode: string; costPrice?: number; sellingPrice?: number }[] = [];
    const existingByCombo = new Map<string, { qty: number; skuCode?: string }>();
    if (Array.isArray(existingVariants)) {
      for (const v of existingVariants) {
        const combo = String(v.variant ?? '').trim();
        if (combo) existingByCombo.set(combo, { qty: Number(v.qty ?? 0), skuCode: v.skuCode ?? undefined });
      }
    }
    if (Array.isArray(variantsRaw)) {
      variantsArray = variantsRaw
        .filter((v: any) => v && String(v.variant ?? '').trim())
        .map((v: any) => {
          const combo = String(v.variant ?? '').trim();
          const existing = existingByCombo.get(combo);
          const skuCode = v.skuCode ?? existing?.skuCode ?? generateSkuCode(name, combo, organizationId);
          return {
            variant: combo,
            qty: v.qty != null ? Number(v.qty) : (existing?.qty ?? 0),
            skuCode,
            costPrice: v.costPrice != null ? Number(v.costPrice) : productLevelCost,
            sellingPrice: v.sellingPrice != null ? Number(v.sellingPrice) : productLevelSelling,
          };
        });
    } else if (variantsRaw && typeof variantsRaw === 'object' && !Array.isArray(variantsRaw)) {
      const combos = generateVariantCombinations(variantsRaw as Record<string, string[]>);
      variantsArray = combos.map((parts: string[]) => {
        const combo = formatVariantCombo(parts);
        const existing = existingByCombo.get(combo);
        const skuCode = existing?.skuCode ?? generateSkuCode(name, combo, organizationId);
        return {
          variant: combo,
          qty: existing?.qty ?? 0,
          skuCode,
          costPrice: productLevelCost,
          sellingPrice: productLevelSelling,
        };
      });
    }
    const sku = isInventoryItem && variantsArray.length
      ? variantsArray.map((v) => ({
          variantCombo: v.variant,
          skuCode: v.skuCode,
          qty: v.qty,
          costPrice: v.costPrice ?? productLevelCost,
        }))
      : [];
    return { variants: variantsArray, sku };
  }

  static async bulkImportFromCsv(
    filePath: string,
    organizationId: string
  ): Promise<{
    hit: number;
    miss: number;
    created: number;
    updated: number;
    errors: { row: number; field?: string; reason: string }[];
    imported: Product[];
  }> {
    try {
      const rows = this.parseCsvFile(filePath);
      const errors: { row: number; field?: string; reason: string }[] = [];
      const created: Product[] = [];
      const updated: Product[] = [];
      const orgId = new Types.ObjectId(organizationId);

      /** Escape special regex chars in name for $regex. */
      const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      for (let i = 0; i < rows.length; i++) {
        const rowNum = i + 2; // 1-based, row 1 = headers
        const row = rows[i];
        const name = String(row.name ?? row.Name ?? '').trim();
        if (!name) {
          errors.push({ row: rowNum, reason: 'Name required' });
          continue;
        }
        const variantsRaw = String(row.variants ?? '').trim();
        const variantsInput = parseVariantsFromCsvCell(variantsRaw);
        const costPrice = row.costPrice ? Number(row.costPrice) : undefined;
        const sellingPrice = row.sellingPrice ? Number(row.sellingPrice) : undefined;
        const isInventoryItem =
          row.isInventoryItem !== undefined
            ? String(row.isInventoryItem).toLowerCase() !== 'false'
            : true;

        const existing = await ProductModel.findOne({
          organizationId: orgId,
          name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
        })
          .lean()
          .exec();

        if (existing) {
          const existingAny = existing as any;
          let variantsArrayPayload = existingAny.variants;
          let skuPayload = existingAny.sku;
          if (variantsInput !== undefined) {
            const built = this.buildVariantsAndSkuFromCsv(
              variantsInput,
              name,
              organizationId,
              costPrice ?? existingAny.costPrice,
              sellingPrice ?? existingAny.sellingPrice,
              existingAny.variants,
              isInventoryItem
            );
            variantsArrayPayload = built.variants;
            skuPayload = built.sku;
          }
          const updatePayload: any = {
            ...(variantsArrayPayload && { variants: variantsArrayPayload }),
            ...(skuPayload && { sku: skuPayload }),
          };
          if (row.costPrice !== undefined && row.costPrice !== '') updatePayload.costPrice = Number(row.costPrice);
          if (row.sellingPrice !== undefined && row.sellingPrice !== '') updatePayload.sellingPrice = Number(row.sellingPrice);
          if (row.hsnOrSacCode !== undefined) updatePayload.hsnOrSacCode = String(row.hsnOrSacCode).trim() || undefined;
          if (row.hsnCode !== undefined) updatePayload.hsnOrSacCode = updatePayload.hsnOrSacCode ?? (String(row.hsnCode).trim() || undefined);
          if (row.isInventoryItem !== undefined) updatePayload.isInventoryItem = isInventoryItem;
          if (row.productType !== undefined) updatePayload.productType = String(row.productType).trim() || undefined;
          if (row.bom !== undefined && String(row.bom).trim()) {
            try {
              updatePayload.bom = JSON.parse(String(row.bom));
            } catch {
              /* leave unchanged */
            }
          }
          if (row.parentProductId !== undefined) updatePayload.parentProductId = String(row.parentProductId).trim() || undefined;
          if (row.gstRate !== undefined && row.gstRate !== '') updatePayload.gstRate = Number(row.gstRate);
          if (row.category !== undefined) updatePayload.category = String(row.category).trim() || undefined;
          if (row.unit !== undefined) updatePayload.unit = String(row.unit).trim() || undefined;
          if (row.lowStockThreshold !== undefined && row.lowStockThreshold !== '') updatePayload.lowStockThreshold = Number(row.lowStockThreshold);
          if (row.tags !== undefined) updatePayload.tags = String(row.tags).split(',').map((s: string) => s.trim()).filter(Boolean);
          if (row.notes !== undefined) updatePayload.notes = String(row.notes).trim() || undefined;
          if (row.isActive !== undefined) updatePayload.isActive = String(row.isActive).toLowerCase() !== 'false';

          const updatedDoc = await ProductModel.findOneAndUpdate(
            { _id: existingAny._id },
            { $set: updatePayload },
            { new: true, runValidators: true }
          )
            .lean()
            .exec();
          if (updatedDoc) updated.push(updatedDoc as unknown as Product);
        } else {
          const createdDoc = await this.create(
            {
              name,
              variants: variantsInput,
              costPrice,
              sellingPrice,
              hsnOrSacCode: row.hsnOrSacCode ? String(row.hsnOrSacCode) : row.hsnCode ? String(row.hsnCode) : undefined,
              isInventoryItem,
              productType: row.productType ? String(row.productType) : undefined,
              bom: row.bom
                ? (() => {
                    try {
                      return JSON.parse(String(row.bom));
                    } catch {
                      return undefined;
                    }
                  })()
                : undefined,
              parentProductId: row.parentProductId ? String(row.parentProductId) : undefined,
              gstRate: row.gstRate ? Number(row.gstRate) : undefined,
              category: row.category ? String(row.category) : undefined,
              unit: row.unit ? String(row.unit) : undefined,
              lowStockThreshold: row.lowStockThreshold ? Number(row.lowStockThreshold) : undefined,
              tags: row.tags ? String(row.tags).split(',').map((s) => s.trim()).filter(Boolean) : undefined,
              notes: row.notes ? String(row.notes) : undefined,
              isActive: row.isActive === 'false' ? false : true,
            } as ProductCreate,
            organizationId
          );
          created.push(createdDoc);
        }
      }

      return {
        hit: created.length + updated.length,
        miss: errors.length,
        created: created.length,
        updated: updated.length,
        errors,
        imported: [...created, ...updated],
      };
    } finally {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {
        /* ignore */
      }
    }
  }
}
