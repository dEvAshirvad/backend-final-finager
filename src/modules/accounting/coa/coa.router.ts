import { createRouter } from '@/configs/serverConfig';
import { validateRequest } from '@/middlewares/zod-validate-request';
import { z } from 'zod';
import { coaZodCreateSchema, coaZodUpdateSchema } from './coa.model';
import COAHandler from './coa.handler';

const router = createRouter();

const organizationQuerySchema = z.object({
  name: z.string().optional(),
  code: z.string().optional(),
  type: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc', '1', '-1']).optional(),
});

// --- Basic CRUD ---

router.post(
  '/',
  validateRequest({
    body: coaZodCreateSchema,
  }),
  COAHandler.create
);

router.get(
  '/',
  validateRequest({
    query: organizationQuerySchema,
  }),
  COAHandler.list
);

router.get(
  '/code/:code',
  validateRequest({
    params: z.object({ code: z.string() }),
    query: z.object({
      organizationId: z.string().optional(),
    }),
  }),
  COAHandler.getByCode
);

router.put(
  '/:id',
  validateRequest({
    params: z.object({ id: z.string() }),
    body: coaZodUpdateSchema,
  }),
  COAHandler.update
);

router.patch(
  '/:id',
  validateRequest({
    params: z.object({ id: z.string() }),
    body: coaZodUpdateSchema.partial(),
  }),
  COAHandler.patch
);

router.delete(
  '/:id',
  validateRequest({
    params: z.object({ id: z.string() }),
  }),
  COAHandler.remove
);

router.get(
  '/:id',
  validateRequest({
    params: z.object({ id: z.string() }),
  }),
  COAHandler.getById
);

// --- Template ---

router.get(
  '/templates/:industry',
  validateRequest({
    params: z.object({
      industry: z.enum(['retail', 'serviceBased', 'manufacturing']),
    }),
  }),
  COAHandler.getTemplateByIndustry
);

router.post(
  '/template',
  validateRequest({
    body: z.object({
      accounts: z.array(coaZodCreateSchema),
    }),
  }),
  COAHandler.createFromTemplate
);

// --- Tree ---

router.get(
  '/tree/all',
  validateRequest({
    query: z.object({
      organizationId: z.string().optional(),
    }),
  }),
  COAHandler.getFullTree
);

router.get(
  '/tree/roots',
  validateRequest({
    query: z.object({
      organizationId: z.string().optional(),
    }),
  }),
  COAHandler.getRootAccounts
);

router.get(
  '/tree/leaves',
  validateRequest({
    query: z.object({
      organizationId: z.string().optional(),
    }),
  }),
  COAHandler.getLeafAccounts
);

// --- Hierarchy navigation ---

router.get(
  '/:id/ancestors',
  validateRequest({
    params: z.object({ id: z.string() }),
    query: z.object({
      organizationId: z.string().optional(),
    }),
  }),
  COAHandler.getAncestors
);

router.get(
  '/:id/descendants',
  validateRequest({
    params: z.object({ id: z.string() }),
    query: z.object({
      organizationId: z.string().optional(),
    }),
  }),
  COAHandler.getDescendants
);

router.get(
  '/:id/children',
  validateRequest({
    params: z.object({ id: z.string() }),
    query: z.object({
      organizationId: z.string().optional(),
    }),
  }),
  COAHandler.getChildren
);

router.get(
  '/:id/path',
  validateRequest({
    params: z.object({ id: z.string() }),
    query: z.object({
      organizationId: z.string().optional(),
    }),
  }),
  COAHandler.getPath
);

router.get(
  '/:id/level',
  validateRequest({
    params: z.object({ id: z.string() }),
    query: z.object({
      organizationId: z.string().optional(),
    }),
  }),
  COAHandler.getLevel
);

router.patch(
  '/:id/move',
  validateRequest({
    params: z.object({ id: z.string() }),
    body: z.object({
      newParentCode: z.string().nullable(),
    }),
  }),
  COAHandler.move
);

// --- Statistics ---

router.get(
  '/statistics/overview',
  validateRequest({
    query: z.object({
      organizationId: z.string().optional(),
    }),
  }),
  COAHandler.getOverviewStatistics
);

// --- Journal entries (placeholder) ---

router.get(
  '/:id/journal-entries',
  validateRequest({
    params: z.object({ id: z.string() }),
  }),
  COAHandler.getJournalEntries
);

export default router;
