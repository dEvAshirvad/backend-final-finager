import mongoose, { Schema } from 'mongoose';
import z from 'zod';

const coaZodSchema = z.object({
  id: z.string(),
  organizationId: z.string().optional(),
  code: z.string(),
  name: z.string(),
  description: z.string().optional(),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']),
  normalBalance: z.enum(['DEBIT', 'CREDIT']),
  isSystem: z.boolean().default(false),
  openingBalance: z.number().default(0),
  currentBalance: z.number().default(0),
  parentCode: z.string().optional().nullable(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const coaZodCreateSchema = coaZodSchema.omit({
  id: true,
  organizationId: true,
  openingBalance: true,
  currentBalance: true,
  isSystem: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
});

export const coaZodUpdateSchema = coaZodSchema.omit({
  id: true,
  organizationId: true,
  openingBalance: true,
  currentBalance: true,
  isSystem: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
});

export type COAUpdate = z.infer<typeof coaZodUpdateSchema>;
export type COA = z.infer<typeof coaZodSchema>;
export type COACreate = z.infer<typeof coaZodCreateSchema>;

const COASchema = new Schema<COA>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'organization',
      required: true,
      index: true,
    },
    code: { type: String, required: true }, // e.g. "1001"
    name: { type: String, required: true }, // "Cash in Hand"
    type: {
      type: String,
      enum: ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'],
      required: true,
    },
    normalBalance: { type: String, enum: ['DEBIT', 'CREDIT'], required: true },
    isSystem: { type: Boolean, default: false }, // cannot delete system accounts
    createdBy: { type: Schema.Types.ObjectId, ref: 'user' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'user' },
    openingBalance: { type: Number, default: 0 },
    currentBalance: { type: Number, default: 0 },
    description: String,
    parentCode: {
      type: String,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

COASchema.index({ organizationId: 1, code: 1 }, { unique: true });
export const COAModel = mongoose.model<COA>('coa', COASchema);
