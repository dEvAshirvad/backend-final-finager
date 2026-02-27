import { TransactionModel, transactionZod } from '../transaction.model';
import mongoose, { Schema } from 'mongoose';
import z from 'zod';

// ─── Zod schemas ────────────────────────────────────────────────────────────
const invoiceItemZ = z.object({
  productId: z.string().optional().nullable(),
  qty: z.number().min(0),
  discount: z.number().min(0).optional().default(0),
  taxableAmount: z.number().min(0),
  rate: z.number().min(0),
  name: z.string().optional().nullable(),
  hsnOrSacCode: z.string().optional().nullable(),
  gstAmount: z.number().min(0),
  gstRate: z.number().min(0).max(28),
  lineTotal: z.number().min(0),
});

const invoiceZodSchema = transactionZod.extend({
  type: z.literal('INVOICE'),
  dueDate: z.date().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  paymentMode: z.enum(['CASH', 'ONLINE', 'CREDIT']).optional().default('CASH'),
  items: z.array(invoiceItemZ),
  discountTotal: z.number().min(0).optional(),
  totalCost: z.number().min(0).optional(),
});

export type Invoice = z.infer<typeof invoiceZodSchema>;
export const invoiceZodCreateSchema = invoiceZodSchema.omit({
  id: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
});
export const invoiceZodUpdateSchema = invoiceZodCreateSchema.partial();

// ─── Mongoose schema ───────────────────────────────────────────────────────
const InvoiceModel = TransactionModel.discriminator(
  'INVOICE',
  new Schema(
    {
      dueDate: Date,
      paymentTerms: String,
      paymentMode: {
        type: String,
        enum: ['CASH', 'ONLINE', 'CREDIT'],
        default: 'CREDIT',
      },
      items: [
        {
          productId: { type: Schema.Types.ObjectId, ref: 'product' },
          qty: { type: Number, min: 0, default: 0 },
          discount: { type: Number, default: 0 },
          taxableAmount: { type: Number, default: 0 },
          gstAmount: { type: Number, default: 0 },
          gstRate: { type: Number },
          lineTotal: { type: Number, default: 0 },
          name: { type: String, optional: true },
          hsnOrSacCode: { type: String, optional: true },
          rate: { type: Number, min: 0, default: 0 },
        },
      ],
      discountTotal: { type: Number, default: 0 },
      totalCost: { type: Number, default: 0 }, // sum(qty * product.avgCost)
    },
    { timestamps: true }
  )
);

export { InvoiceModel as Invoice };
export default InvoiceModel;
