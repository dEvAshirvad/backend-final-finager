import mongoose, { Schema } from 'mongoose';
import z from 'zod';

export const recurringZ = z.object({
  id: z.string().optional(),
  organizationId: z.string(),
  templateId: z.string(),
  payload: z.any().optional(),
  schedule: z.object({
    type: z.enum(['daily', 'weekly', 'monthly', 'calendar_monthly']),
    time: z.string().optional(), // "HH:mm"
    dayOfWeek: z.number().min(0).max(6).optional(), // for weekly
    dayOfMonth: z.number().min(1).max(31).optional(), // for monthly
  }),
  timezone: z.string().optional(),
  nextRun: z.date().optional().nullable(),
  lastRun: z.date().optional().nullable(),
  startAt: z.date().optional().nullable(),
  endAt: z.date().optional().nullable(),
  enabled: z.boolean().default(true),
  runCount: z.number().default(0),
  maxRuns: z.number().optional(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type RecurringEvent = z.infer<typeof recurringZ>;

const ScheduleSchema = new Schema(
  {
    type: { type: String, enum: ['daily', 'weekly', 'monthly', 'calendar_monthly'], required: true },
    time: String,
    dayOfWeek: Number,
    dayOfMonth: Number,
  },
  { _id: false }
);

const RecurringSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'organization', required: true, index: true },
    templateId: { type: Schema.Types.ObjectId, ref: 'event_template', required: true },
    payload: { type: Schema.Types.Mixed },
    schedule: { type: ScheduleSchema, required: true },
    timezone: String,
    nextRun: Date,
    lastRun: Date,
    startAt: Date,
    endAt: Date,
    enabled: { type: Boolean, default: true },
    runCount: { type: Number, default: 0 },
    maxRuns: Number,
    createdBy: { type: Schema.Types.ObjectId, ref: 'user' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'user' },
  },
  { timestamps: true, collection: 'event_recurring' }
);

export const RecurringModel = mongoose.model<RecurringEvent & mongoose.Document>('event_recurring', RecurringSchema);

export default RecurringModel;

