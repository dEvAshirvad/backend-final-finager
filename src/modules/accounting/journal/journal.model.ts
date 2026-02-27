import mongoose, { Schema, Types } from 'mongoose';
import z from 'zod';

const journalLineZodSchema = z.object({
  accountId: z.string(),
  debit: z.number().min(0).default(0),
  credit: z.number().min(0).default(0),
  narration: z.string().optional(),
});

/** Accepts ISO date string "YYYY-MM-DD" or Date; outputs Date */
const dateSchema = z
  .union([z.string(), z.date()])
  .transform((v) => (v instanceof Date ? v : new Date(v)));

const journalEntryZodSchema = z.object({
  id: z.string(),
  organizationId: z.instanceof(Types.ObjectId),
  date: dateSchema,
  reference: z.string(),
  description: z.string().optional(),
  lines: z.array(journalLineZodSchema).min(2),
  status: z.enum(['DRAFT', 'POSTED', 'REVERSED']).default('DRAFT'),
  createdBy: z.string(),
  updatedBy: z.string(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
});

export const journalLineCreateSchema = journalLineZodSchema.refine(
  (l) => l.debit > 0 !== l.credit > 0,
  { message: 'Each line must have either debit or credit, not both' }
);

export const journalEntryCreateSchema = journalEntryZodSchema
  .extend({
    date: dateSchema,
    lines: z.array(journalLineCreateSchema),
  })
  .omit({
    organizationId: true,
    status: true,
    id: true,
    createdAt: true,
    updatedAt: true,
    createdBy: true,
    updatedBy: true,
  })
  .refine(
    (e) => {
      const totalDebit = e.lines.reduce((s, l) => s + (l.debit || 0), 0);
      const totalCredit = e.lines.reduce((s, l) => s + (l.credit || 0), 0);
      return Math.abs(totalDebit - totalCredit) < 0.01;
    },
    { message: 'Total debits must equal total credits' }
  );

/** Update schema: status cannot be changed via update (use post/reverse endpoints) */
export const journalEntryUpdateSchema = journalEntryZodSchema
  .extend({ date: dateSchema.optional() })
  .omit({
    id: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    createdBy: true,
    updatedBy: true,
    organizationId: true,
  })
  .partial();

export const journalBulkCreateSchema = z
  .array(journalEntryCreateSchema)
  .min(1, 'At least one journal entry is required')
  .max(100, 'Maximum 100 entries per bulk create');

export type JournalLine = z.infer<typeof journalLineZodSchema>;
export type JournalEntry = z.infer<typeof journalEntryZodSchema>;
export type JournalEntryCreate = z.infer<typeof journalEntryCreateSchema>;
export type JournalEntryUpdate = z.infer<typeof journalEntryUpdateSchema>;
export type JournalBulkCreate = z.infer<typeof journalBulkCreateSchema>;

const journalLineSchema = new Schema(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'coa',
      required: true,
    },
    debit: { type: Number, default: 0, min: 0 },
    credit: { type: Number, default: 0, min: 0 },
    narration: String,
  },
  { _id: false }
);

const journalEntrySchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'organization',
      required: true,
      index: true,
    },
    date: { type: Date, required: true, default: Date.now },
    reference: { type: String, required: true },
    description: String,
    lines: {
      type: [journalLineSchema],
      required: true,
      validate: {
        validator(lines: { debit: number; credit: number }[]) {
          const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
          const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
          return Math.abs(totalDebit - totalCredit) < 0.01;
        },
        message: 'Journal must balance: total debit must equal total credit',
      },
    },
    status: {
      type: String,
      enum: ['DRAFT', 'POSTED', 'REVERSED'],
      default: 'DRAFT',
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'user' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'user' },
  },
  { timestamps: true }
);

journalEntrySchema.index({ organizationId: 1, reference: 1 }, { unique: true });
journalEntrySchema.index({ organizationId: 1, date: -1 });
journalEntrySchema.index({ organizationId: 1, createdBy: 1 });

export const JournalEntryModel = mongoose.model<JournalEntry>(
  'journal',
  journalEntrySchema
);
