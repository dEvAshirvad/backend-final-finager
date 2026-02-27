import mongoose from 'mongoose';
import { z } from 'zod';

const organizationZodSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  logo: z.string().optional(),
  createdAt: z.date(),
  metadata: z.string().optional(),
  gstin: z.string().optional(),
  industry: z.string().optional(),
  pan: z.string().optional(),
  financialYearStart: z.date().optional(),
  orgCode: z.string().optional(),
});

export type Organization = z.infer<typeof organizationZodSchema>;

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      required: true,
    },
    logo: {
      type: String,
      required: false,
    },
    metadata: {
      type: String,
      required: false,
    },
    gstin: {
      type: String,
      required: false,
    },
    industry: {
      type: String,
      required: false,
    },
    pan: {
      type: String,
      required: false,
    },
    financialYearStart: {
      type: Date,
      required: false,
    },
    assignedRoleCA: {
      type: String,
      required: false,
    },
    assignedRoleOwner: {
      type: String,
      required: false,
    },
    orgCode: {
      type: String,
      required: false,
      unique: true,
    },
  },
  {
    timestamps: true,
    collection: 'organization',
  }
);

export const OrganizationModel = mongoose.model<Organization>(
  'organization',
  organizationSchema
);
