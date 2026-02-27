import mongoose, { Schema, Types } from 'mongoose';
import z from 'zod';

// ─── Zod schemas ────────────────────────────────────────────────────────────
const productZodSchema = z.object({
  _id: z.instanceof(Types.ObjectId).optional(),
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  variants: z
    .array(
      z.object({
        variant: z.string(),
        qty: z.number().min(0).optional().nullable(),
        skuCode: z.string().optional().nullable(),
        costPrice: z.number().optional().nullable(),
      })
    )
    .optional()
    .nullable(),
  hsnOrSacCode: z.string().optional().nullable(),
  isInventoryItem: z.boolean().optional().default(true),
  productType: z
    .enum(['RAW', 'WIP', 'FINISHED', 'SERVICE'])
    .optional()
    .default('FINISHED'),
  parentProductId: z.string().optional().nullable(),
  bom: z
    .array(
      z.object({
        componentProductId: z.string(),
        qty: z.number().min(0),
      })
    )
    .optional(),
  category: z.string().optional().nullable(),
  unit: z.enum(['pcs', 'kg', 'mtr', 'ltr', 'box', 'set', 'other']).optional(),
  gstRate: z.number().optional().nullable(),
  sellingPrice: z.number().optional().nullable(),
  costPrice: z.number().optional().nullable(),
  lowStockThreshold: z.number().optional().nullable(),
  transactionRules: z
    .array(
      z.object({
        action: z.string(),
        journalConfig: z.any().optional(),
      })
    )
    .optional(),
  isActive: z.boolean().default(true),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
  createdBy: z.string().optional().nullable(),
  updatedBy: z.string().optional().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const productZodCreateBase = productZodSchema.omit({
  id: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
});

export const productZodCreateSchema = productZodCreateBase;
export const productZodUpdateSchema = productZodCreateBase.partial();

export type Product = z.infer<typeof productZodSchema>;
export type ProductCreate = z.infer<typeof productZodCreateSchema>;
export type ProductUpdate = z.infer<typeof productZodUpdateSchema>;

// ─── Mongoose schema ─────────────────────────────────────────────────────────
const ProductSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'organization',
      required: true,
      index: true,
    },

    name: { type: String, required: true, trim: true },
    // Variants are provided by frontend as an array of objects:
    // [{ variant: "orange-M", qty: 3, skuCode?: "...", costPrice?: 200 }, ...]
    variants: [
      {
        variant: { type: String },
        qty: { type: Number, default: 0, min: 0 },
        skuCode: { type: String },
        costPrice: { type: Number },
        sellingPrice: Number,
      },
    ],
    hsnOrSacCode: { type: String, sparse: true },
    isInventoryItem: { type: Boolean, default: true },
    productType: {
      type: String,
      enum: ['RAW', 'WIP', 'FINISHED', 'SERVICE'],
      default: 'FINISHED',
    },
    parentProductId: {
      type: Schema.Types.ObjectId,
      ref: 'product',
      sparse: true,
    },
    bom: [
      {
        componentProductId: { type: Schema.Types.ObjectId, ref: 'product' },
        qty: { type: Number, min: 0 },
      },
    ],
    category: String,
    unit: {
      type: String,
      default: 'pcs',
      enum: ['pcs', 'kg', 'mtr', 'ltr', 'box', 'set', 'other'],
    },
    gstRate: { type: Number, default: 18, min: 0, max: 28 },
    sellingPrice: Number,
    costPrice: Number, // base cost (variants can override)
    lowStockThreshold: { type: Number, default: 10 },
    isActive: { type: Boolean, default: true },
    tags: [String],
    notes: String,
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

// Virtuals (computed)
ProductSchema.virtual('currentQty').get(function () {
  if (!this.isInventoryItem) return 0;

  if (Array.isArray(this.variants) && this.variants.length) {
    return this.variants.reduce((sum: number, v: any) => sum + (v.qty || 0), 0);
  }
  return 0;
});
ProductSchema.virtual('totalCostValue').get(function () {
  if (!this.isInventoryItem) return 0;

  if (Array.isArray(this.variants) && this.variants.length) {
    return this.variants.reduce(
      (sum: number, v: any) =>
        sum + (v.qty || 0) * (v.costPrice || this.costPrice || 0),
      0
    );
  }
  return 0;
});
ProductSchema.virtual('avgCost').get(function () {
  if (!this.isInventoryItem) return 0;
  const totalValue = (this as any).totalCostValue;
  const totalQty = (this as any).currentQty;
  return totalQty > 0 ? totalValue / totalQty : 0;
});

// Convenience virtual — total stock across variants (frontend variants)
ProductSchema.virtual('totalStock').get(function () {
  if (Array.isArray(this.variants) && this.variants.length) {
    return this.variants.reduce((s: number, v: any) => s + (v.qty || 0), 0);
  }
  return (this as any).currentQty || 0;
});

export const ProductModel = mongoose.model('product', ProductSchema);
