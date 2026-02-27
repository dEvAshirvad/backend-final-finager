import mongoose, { Schema } from 'mongoose';
import z from 'zod';

// ─── Zod schemas ────────────────────────────────────────────────────────────
export const transactionZod = z.object({
  id: z.string().optional(),
  organizationId: z.string(),
  type: z.string(),
  reference: z.string(),
  date: z.date(),
  contactId: z.string(),
  totalAmount: z.number().min(0),
  taxableAmount: z.number().min(0).optional(),
  gstAmount: z.number().min(0).optional(),
  cgst: z.number().min(0).optional(),
  sgst: z.number().min(0).optional(),
  igst: z.number().min(0).optional(),
  status: z
    .enum(['DRAFT', 'POSTED', 'PAID', 'PARTIAL', 'CANCELLED'])
    .default('DRAFT'),
  journalId: z.string().optional().nullable(),
  createdBy: z.string().optional().nullable(),
  updatedBy: z.string().optional().nullable(),
  placeOfSupply: z.string().optional().nullable(),
  autoPosting: z.boolean().optional().default(false),
  narration: z.string().optional().nullable(),
  paymentDue: z.date().optional().nullable(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type Transaction = z.infer<typeof transactionZod>;
export const transactionZodCreateSchema = transactionZod.omit({
  id: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
});
export const transactionZodUpdateSchema = transactionZodCreateSchema.partial();

// ─── Mongoose schema ───────────────────────────────────────────────────────
const baseTransactionSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'organization',
      required: true,
    },
    type: { type: String, required: true, index: true },
    reference: { type: String, required: true },
    date: { type: Date, required: true },
    contactId: { type: Schema.Types.ObjectId, ref: 'contact', required: true },
    totalAmount: { type: Number, required: true },
    taxableAmount: Number,
    gstAmount: Number,
    cgst: Number,
    sgst: Number,
    igst: Number,
    status: {
      type: String,
      enum: ['DRAFT', 'POSTED', 'PAID', 'PARTIAL', 'CANCELLED'],
      default: 'DRAFT',
    },
    journalId: { type: Schema.Types.ObjectId, ref: 'journal' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'user' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'user' },
    placeOfSupply: String,
    autoPosting: { type: Boolean, default: false },
    paymentDue: Date,
  },
  { discriminatorKey: 'type', timestamps: true }
);

// Make reference unique per organization
baseTransactionSchema.index(
  { organizationId: 1, reference: 1 },
  { unique: true }
);

export const TransactionModel = mongoose.model(
  'transaction',
  baseTransactionSchema
);
