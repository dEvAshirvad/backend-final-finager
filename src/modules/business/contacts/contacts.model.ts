import mongoose, { Schema } from 'mongoose';
import z from 'zod';
import { validateGstinChecksum } from '@/lib/validators';

// ─── Zod schemas ────────────────────────────────────────────────────────────
const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

const contactZodSchema = z.object({
  id: z.string(),
  organizationId: z.string().optional(),
  type: z.enum(['CUSTOMER', 'VENDOR', 'BOTH']),
  name: z.string().optional().nullable(),
  legalName: z.string().optional().nullable(),
  gstin: z
    .string()
    .refine((v) => !v || gstinRegex.test(v), 'Invalid GSTIN format')
    .refine((v) => !v || validateGstinChecksum(v), 'Invalid GSTIN checksum')
    .optional()
    .nullable(),
  pan: z
    .string()
    .refine((v) => !v || panRegex.test(v), 'Invalid PAN format')
    .optional()
    .nullable(),
  email: z
    .union([z.string().email(), z.literal('')])
    .optional()
    .nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  stateCode: z.string().optional().nullable(),
  pincode: z.string().optional().nullable(),
  placeOfSupply: z.string().optional().nullable(),
  openingBalance: z.number().default(0),
  currentBalance: z.number().default(0),
  creditLimit: z.number().optional().nullable(),
  paymentTermsDays: z.number().default(30),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  createdBy: z.string().optional().nullable(),
  updatedBy: z.string().optional().nullable(),
  lastTransactionDate: z.date().optional().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const contactZodCreateBase = contactZodSchema.omit({
  id: true,
  organizationId: true,
  openingBalance: true,
  currentBalance: true,
  createdAt: true,
  updatedAt: true,
});

/** Minimal creation: at least one of name, email, or phone required */
export const contactZodCreateSchema = contactZodCreateBase
  .refine(
    (data) =>
      !!(data.name && data.name.trim()) ||
      !!(data.email && data.email.trim()) ||
      !!(data.phone && data.phone.trim()),
    {
      message: 'At least one of name, email, or phone is required',
      path: ['name'],
    }
  )
  .refine(
    (data) => {
      if (!data.gstin || !data.placeOfSupply) return true;
      const gstState = data.gstin.slice(0, 2);
      const posState = data.placeOfSupply.match(/^(\d{2})-/)?.[1];
      return !posState || gstState === posState;
    },
    { message: 'GSTIN state code must match place of supply', path: ['gstin'] }
  );

/** Partial of base schema (Zod 4 disallows .partial() on refined schemas) */
export const contactZodUpdateSchema = contactZodCreateBase.partial();

export type Contact = z.infer<typeof contactZodSchema>;
export type ContactCreate = z.infer<typeof contactZodCreateSchema>;
export type ContactUpdate = z.infer<typeof contactZodUpdateSchema>;

// ─── Mongoose schema (strictly follow given schema) ───────────────────────────
const ContactSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'organization',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['CUSTOMER', 'VENDOR', 'BOTH'],
      required: true,
    },
    name: {
      type: String,
      trim: true,
    },
    legalName: {
      type: String,
      trim: true,
    },
    gstin: {
      type: String,
      sparse: true,
      uppercase: true,
      validate: {
        validator: (v: string) =>
          !v ||
          /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v),
        message: 'Invalid GSTIN format',
      },
    },
    pan: {
      type: String,
      sparse: true,
      uppercase: true,
      validate: {
        validator: (v: string) => !v || /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(v),
        message: 'Invalid PAN format',
      },
    },
    email: { type: String, lowercase: true },
    phone: String,
    address: String,
    city: String,
    state: String,
    stateCode: String,
    pincode: String,
    placeOfSupply: String,
    openingBalance: { type: Number, default: 0 },
    currentBalance: { type: Number, default: 0 },
    creditLimit: Number,
    paymentTermsDays: { type: Number, default: 30 },
    tags: [String],
    notes: String,
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'user' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'user' },
    lastTransactionDate: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

ContactSchema.index({ organizationId: 1, gstin: 1 }, { sparse: true });
ContactSchema.index({ organizationId: 1, pan: 1 }, { sparse: true });
ContactSchema.index({ organizationId: 1, email: 1 }, { sparse: true });
ContactSchema.index({ organizationId: 1, phone: 1 }, { sparse: true });

ContactSchema.virtual('arApType').get(function () {
  if (this.type === 'CUSTOMER') return 'Receivable';
  if (this.type === 'VENDOR') return 'Payable';
  return 'Both';
});

export const ContactModel = mongoose.model('contact', ContactSchema);
