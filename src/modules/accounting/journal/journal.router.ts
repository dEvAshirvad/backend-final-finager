import { createRouter } from '@/configs/serverConfig';
import { validateRequest } from '@/middlewares/zod-validate-request';
import { z } from 'zod';
import { uploadJournalCsv } from '@/configs/multer';
import {
  journalEntryCreateSchema,
  journalEntryUpdateSchema,
  journalBulkCreateSchema,
} from './journal.model';
import JournalHandler from './journal.handler';

const router = createRouter();

const journalLineSchema = z.object({
  accountId: z.string(),
  debit: z.number().min(0).default(0),
  credit: z.number().min(0).default(0),
  narration: z.string().optional(),
});

router.post(
  '/',
  validateRequest({
    body: journalEntryCreateSchema,
  }),
  JournalHandler.create
);

router.post(
  '/bulk',
  validateRequest({
    body: z.object({ entries: journalBulkCreateSchema }),
  }),
  JournalHandler.createMany
);

router.post(
  '/validate',
  validateRequest({
    body: z.object({
      lines: z.array(journalLineSchema).min(2),
      organizationId: z.string().optional(),
    }),
  }),
  JournalHandler.validate
);

router.post(
  '/post',
  validateRequest({
    body: z.object({ ids: z.array(z.string()).min(1) }),
  }),
  JournalHandler.post
);

router.post(
  '/reverse',
  validateRequest({
    body: z.object({ ids: z.array(z.string()).min(1) }),
  }),
  JournalHandler.reverse
);

router.get('/template', JournalHandler.downloadTemplate);
router.post('/import', uploadJournalCsv.single('file'), JournalHandler.importCsv);

router.get(
  '/',
  validateRequest({
    query: z.object({
      reference: z.string().optional(),
      dateFrom: z.coerce.date().optional(),
      dateTo: z.coerce.date().optional(),
      description: z.string().optional(),
      status: z.string().optional(),
      createdBy: z.string().optional(),
      updatedBy: z.string().optional(),
      createdAt: z.coerce.date().optional(),
      updatedAt: z.coerce.date().optional(),
      page: z.string().optional(),
      limit: z.string().optional(),
      sort: z.string().optional(),
      order: z.enum(['asc', 'desc', '1', '-1'] as const).optional(),
    }),
  }),
  JournalHandler.list
);

router.get(
  '/:id',
  validateRequest({
    params: z.object({ id: z.string() }),
  }),
  JournalHandler.getById
);

router.put(
  '/:id',
  validateRequest({
    params: z.object({ id: z.string() }),
    body: journalEntryUpdateSchema,
  }),
  JournalHandler.update
);

router.patch(
  '/:id',
  validateRequest({
    params: z.object({ id: z.string() }),
    body: journalEntryUpdateSchema.partial(),
  }),
  JournalHandler.update
);

router.delete(
  '/:id',
  validateRequest({
    params: z.object({ id: z.string() }),
  }),
  JournalHandler.remove
);

export default router;
