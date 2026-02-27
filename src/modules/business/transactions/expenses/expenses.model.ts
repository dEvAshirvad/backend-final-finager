import { TransactionModel, transactionZod } from '../transaction.model';
import mongoose, { Schema, Types } from 'mongoose';
import z from 'zod';

// ─── Zod schemas ────────────────────────────────────────────────────────────
const expenseItemZ = z.object({
  description: z.string().optional().nullable(),
  amount: z.number().min(0),
  category: z.string().optional().nullable(),
});

const inventoryItemZ = z.object({
  productId: z.string(),
  qty: z.number().min(0),
  costPerUnit: z.number().min(0),
  skuCombo: z.string().optional().nullable(),
});

const expenseZodSchema = transactionZod.extend({
  type: z.literal('EXPENSE'),
  category: z.string().optional().nullable(),
  expenseType: z.string().optional().nullable(),
  paymentMode: z.enum(['CASH', 'ONLINE', 'CREDIT']).optional().default('CASH'),
  items: z.array(expenseItemZ).optional(),
  receiptRef: z.string().optional().nullable(),
  attachmentUrl: z.string().optional().nullable(),
  isInventoryItem: z.boolean().optional().default(false),
  inventoryItems: z.array(inventoryItemZ).optional(),
});

export type Expense = z.infer<typeof expenseZodSchema>;
export type ExpenseItem = z.infer<typeof expenseItemZ>;
export type ExpenseInventoryItem = z.infer<typeof inventoryItemZ>;

export const expenseZodCreateSchema = expenseZodSchema.omit({
  id: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
});
export const expenseZodUpdateSchema = expenseZodCreateSchema.partial();

// ─── Mongoose schema ───────────────────────────────────────────────────────
const ExpenseModel = TransactionModel.discriminator(
  'EXPENSE',
  new Schema(
    {
      category: String,
      expenseType: String,
      paymentMode: {
        type: String,
        enum: ['CASH', 'ONLINE', 'CREDIT'],
        default: 'CASH',
      },
      items: [
        {
          description: String,
          amount: { type: Number, default: 0 },
          category: String,
        },
      ],
      receiptRef: String,
      attachmentUrl: String,
      isInventoryItem: { type: Boolean, default: false },
      inventoryItems: [
        {
          productId: { type: Schema.Types.ObjectId, ref: 'product' },
          qty: { type: Number, min: 0, default: 0 },
          costPerUnit: { type: Number, min: 0, default: 0 },
          skuCombo: String,
        },
      ],
    },
    { timestamps: true }
  )
);

export { ExpenseModel as Expense };
export default ExpenseModel;
