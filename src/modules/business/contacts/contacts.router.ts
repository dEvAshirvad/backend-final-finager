import { createRouter } from '@/configs/serverConfig';
import { validateRequest } from '@/middlewares/zod-validate-request';
import { z } from 'zod';
import { uploadContactCsv } from '@/configs/multer';
import {
  contactZodCreateSchema,
  contactZodUpdateSchema,
} from './contacts.model';
import ContactsHandler from './contacts.handler';

const router = createRouter();

const listQuerySchema = z.object({
  type: z.enum(['CUSTOMER', 'VENDOR', 'BOTH']).optional(),
  name: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc', '1', '-1']).optional(),
});

const bulkImportBodySchema = z.object({
  contacts: z.array(contactZodCreateSchema),
});

const mapHeadersBodySchema = z.object({
  headers: z.array(z.string()),
});

// ─── CRUD ───────────────────────────────────────────────────────────────────

router.post(
  '/',
  validateRequest({
    body: contactZodCreateSchema,
  }),
  ContactsHandler.create
);

router.get(
  '/',
  validateRequest({
    query: listQuerySchema,
  }),
  ContactsHandler.list
);

// Static routes before :id to avoid "export"/"template" being matched as ids
router.get(
  '/export/json',
  validateRequest({
    query: z.object({
      type: z.enum(['CUSTOMER', 'VENDOR', 'BOTH']).optional(),
    }),
  }),
  ContactsHandler.exportJson
);

router.get(
  '/export/csv',
  validateRequest({
    query: z.object({
      type: z.enum(['CUSTOMER', 'VENDOR', 'BOTH']).optional(),
    }),
  }),
  ContactsHandler.exportCsv
);

router.get('/template', ContactsHandler.downloadTemplate);

router.post(
  '/import/csv',
  uploadContactCsv.single('file'),
  ContactsHandler.bulkImportCsv
);

router.get(
  '/:id',
  validateRequest({
    params: z.object({ id: z.string().min(1) }),
  }),
  ContactsHandler.getById
);

router.put(
  '/:id',
  validateRequest({
    params: z.object({ id: z.string().min(1) }),
    body: contactZodUpdateSchema,
  }),
  ContactsHandler.update
);

router.patch(
  '/:id',
  validateRequest({
    params: z.object({ id: z.string().min(1) }),
    body: contactZodUpdateSchema.partial(),
  }),
  ContactsHandler.update
);

router.delete(
  '/:id',
  validateRequest({
    params: z.object({ id: z.string().min(1) }),
  }),
  ContactsHandler.remove
);

// ─── Bulk import ───────────────────────────────────────────────────────────

router.post(
  '/import',
  validateRequest({
    body: bulkImportBodySchema,
  }),
  ContactsHandler.bulkImport
);

router.post(
  '/import/map-headers',
  validateRequest({
    body: mapHeadersBodySchema,
  }),
  ContactsHandler.mapHeaders
);

export default router;
