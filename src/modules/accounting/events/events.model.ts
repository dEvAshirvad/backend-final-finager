import mongoose, { Schema } from 'mongoose';
import z from 'zod';

// ─── Zod schemas ────────────────────────────────────────────────────────────
const amountConfigZ = z.object({
  field: z.string(),
  operator: z.enum(['direct', '%', '+', '-', '*']).default('direct'),
  operand: z.number().optional(),
});

const lineRuleZ = z
  .object({
    accountId: z.string().optional(),
    accountCode: z.string().optional(),
    direction: z.enum(['debit', 'credit']),
    amountConfig: amountConfigZ,
    narrationConfig: z.array(z.string()).optional(),
  })
  .refine((data) => data.accountId != null || (data.accountCode != null && data.accountCode !== ''), {
    message: 'Each linesRule must include accountCode or accountId',
    path: ['linesRule'],
  });

const referenceConfigZ = z.object({
  prefix: z.string().default('DOC'),
  serialMethod: z.enum(['randomHex', 'incrementor']).default('incrementor'),
  length: z.number().default(6),
});

export const eventTemplateZod = z.object({
  id: z.string().optional(),
  organizationId: z.string(),
  name: z.string(),
  orchid: z.string(),
  referenceConfig: referenceConfigZ.optional(),
  narrationConfig: z.string().optional(),
  inputSchema: z.any().optional(),
  plugins: z.array(z.string()).optional(),
  linesRule: z.array(lineRuleZ).optional(),
  isSystemGenerated: z.boolean().default(false), // Can't be deleted if true
  isActive: z.boolean().optional().default(true),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const eventInstanceZod = z.object({
  id: z.string().optional(),
  organizationId: z.string(),
  templateId: z.string(),
  type: z.string(),
  reference: z.string(),
  payload: z.any(),
  status: z.enum(['PENDING', 'PROCESSED', 'FAILED']).default('PENDING'),
  processedAt: z.date().optional(),
  errorMessage: z.string().optional().nullable(),
  results: z
    .array(
      z.object({
        plugin: z.string(),
        success: z.boolean(),
        resultId: z.any().optional(),
        error: z.string().optional().nullable(),
      })
    )
    .optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type EventTemplate = z.infer<typeof eventTemplateZod>;
export type EventInstance = z.infer<typeof eventInstanceZod>;

// ─── Mongoose schemas ───────────────────────────────────────────────────────
const ReferenceConfigSchema = new Schema(
  {
    prefix: { type: String, required: true, default: 'DOC' },
    serialMethod: {
      type: String,
      enum: ['randomHex', 'incrementor'],
      default: 'incrementor',
    },
    length: { type: Number, default: 6 },
  },
  { _id: false }
);

const AmountConfigSchema = new Schema(
  {
    field: { type: String, required: true },
    operator: {
      type: String,
      enum: ['direct', '%', '+', '-', '*'],
      default: 'direct',
    },
    operand: { type: Number },
  },
  { _id: false }
);

const LineRuleSchema = new Schema(
  {
    accountId: { type: Schema.Types.ObjectId, ref: 'account', required: true },
    direction: { type: String, enum: ['debit', 'credit'], required: true },
    amountConfig: { type: AmountConfigSchema, required: true },
    narrationConfig: { type: [String], default: [] },
  },
  { _id: false }
);

const EventTemplateSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'organization',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    orchid: { type: String, required: true, uppercase: true, trim: true },
    referenceConfig: { type: ReferenceConfigSchema, default: () => ({}) },
    narrationConfig: { type: String, default: '' },
    inputSchema: { type: Schema.Types.Mixed, required: true, default: {} },
    plugins: {
      type: [String],
      default: ['journal'],
      validate: {
        validator: function (v: string[]) {
          return Array.isArray(v) && v.includes('journal');
        },
        message: 'plugins must include journal',
      },
    },
    linesRule: { type: [LineRuleSchema], default: [] },
    isSystemGenerated: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'event_template' }
);

EventTemplateSchema.index({ organizationId: 1, orchid: 1 }, { unique: true });

const EventInstanceSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'organization',
      required: true,
      index: true,
    },
    templateId: {
      type: Schema.Types.ObjectId,
      ref: 'event_template',
      required: true,
    },
    type: { type: String, required: true }, // orchid
    reference: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSED', 'FAILED'],
      default: 'PENDING',
    },
    processedAt: { type: Date },
    errorMessage: { type: String },
    results: [
      {
        plugin: String,
        success: Boolean,
        resultId: Schema.Types.Mixed,
        error: String,
      },
    ],
  },
  { timestamps: true, collection: 'event_instance' }
);

export const EventTemplateModel = mongoose.model<
  EventTemplate & mongoose.Document
>('event_template', EventTemplateSchema);
export const EventInstanceModel = mongoose.model<
  EventInstance & mongoose.Document
>('event_instance', EventInstanceSchema);

export default {
  EventTemplateModel,
  EventInstanceModel,
};
