import { createRouter } from '@/configs/serverConfig';
import { validateRequest } from '@/middlewares/zod-validate-request';
import { z } from 'zod';
import InvoicesHandler from './invoices.handler';
import { uploadContactCsv } from '@/configs/multer';

const router = createRouter();

const listQuerySchema = z.object({
  status: z.string().optional(),
  contactId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  paymentDueBy: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc', '1', '-1']).optional(),
});

const minimalInvoiceItemSchema = z.object({
  productId: z.string().optional().nullable(),
  qty: z.number().min(0),
  rate: z.number().min(0),
  discount: z.number().min(0).optional(),
  gstRate: z.number().min(0).max(28).optional(),
  name: z.string().optional().nullable(),
  hsnOrSacCode: z.string().optional().nullable(),
});

const createBodySchema = z.object({
  reference: z.string().min(1),
  date: z.union([z.string(), z.date()]),
  contactId: z.string().min(1),
  paymentMode: z.enum(['CASH', 'ONLINE', 'CREDIT']).optional(),
  placeOfSupply: z.string().optional().nullable(),
  paymentDue: z.union([z.string(), z.date()]).optional().nullable(),
  items: z.array(minimalInvoiceItemSchema).min(1),
  dueDate: z.union([z.string(), z.date()]).optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  narration: z.string().optional().nullable(),
  payment: z
    .object({
      amount: z.number().min(0),
      date: z.union([z.string(), z.date()]).optional(),
      reference: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional(),
}).passthrough();

const idParamSchema = z.object({ id: z.string().min(1) });

router.post('/', validateRequest({ body: createBodySchema }), InvoicesHandler.create);

router.get('/', validateRequest({ query: listQuerySchema }), InvoicesHandler.list);

router.get('/export/json', InvoicesHandler.exportJson);
router.get('/export/csv', InvoicesHandler.exportCsv);
router.get('/template', InvoicesHandler.downloadTemplate);
router.post('/import', uploadContactCsv.single('file'), InvoicesHandler.bulkImportCsv);

router.get(
  '/:id',
  validateRequest({ params: idParamSchema }),
  InvoicesHandler.getById
);

router.patch(
  '/:id',
  validateRequest({
    params: idParamSchema,
    body: z.object({}).passthrough(),
  }),
  InvoicesHandler.update
);

router.post(
  '/:id/post',
  validateRequest({
    params: idParamSchema,
    body: z.object({ orchid: z.string().optional() }),
  }),
  InvoicesHandler.post
);

router.post(
  '/:id/pay',
  validateRequest({
    params: idParamSchema,
    body: z.object({
      amount: z.number().min(0),
      date: z.union([z.string(), z.date()]).optional(),
      paymentMode: z.string().optional(),
      reference: z.string().optional(),
      notes: z.string().optional(),
    }),
  }),
  InvoicesHandler.pay
);

router.delete(
  '/:id',
  validateRequest({ params: idParamSchema }),
  InvoicesHandler.remove
);

export default router;
