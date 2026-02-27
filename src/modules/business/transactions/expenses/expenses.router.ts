import { createRouter } from '@/configs/serverConfig';
import { validateRequest } from '@/middlewares/zod-validate-request';
import { z } from 'zod';
import ExpensesHandler from './expenses.handler';
import { uploadContactCsv } from '@/configs/multer';

const router = createRouter();

const listQuerySchema = z.object({
  status: z.string().optional(),
  contactId: z.string().optional(),
  category: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  paymentDueBy: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc', '1', '-1']).optional(),
});

const expenseItemSchema = z.object({
  description: z.string().optional().nullable(),
  amount: z.number().min(0),
  category: z.string().optional().nullable(),
});

const inventoryItemSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().min(0),
  costPerUnit: z.number().min(0),
  skuCombo: z.string().optional().nullable(),
});

const createBodySchema = z
  .object({
    reference: z.string().min(1),
    date: z.union([z.string(), z.date()]),
    contactId: z.string().min(1),
    totalAmount: z.number().min(0).optional(),
    category: z.string().optional().nullable(),
    expenseType: z.string().optional().nullable(),
    paymentMode: z.enum(['CASH', 'ONLINE', 'CREDIT']).optional(),
    items: z.array(expenseItemSchema).optional(),
    isInventoryItem: z.boolean().optional(),
    inventoryItems: z.array(inventoryItemSchema).optional(),
    receiptRef: z.string().optional().nullable(),
    attachmentUrl: z.string().optional().nullable(),
    placeOfSupply: z.string().optional().nullable(),
    paymentDue: z.union([z.string(), z.date()]).optional().nullable(),
    narration: z.string().optional().nullable(),
  })
  .refine(
    (data) =>
      (typeof data.totalAmount === 'number' && data.totalAmount > 0) ||
      (Array.isArray(data.items) && data.items.length > 0) ||
      (Array.isArray(data.inventoryItems) && data.inventoryItems.length > 0),
    {
      message:
        'Either totalAmount (positive), items (non-empty array), or inventoryItems (non-empty array) is required',
      path: ['totalAmount'],
    }
  )
  .passthrough();

const idParamSchema = z.object({ id: z.string().min(1) });

router.post('/', validateRequest({ body: createBodySchema }), ExpensesHandler.create);

router.get('/', validateRequest({ query: listQuerySchema }), ExpensesHandler.list);

router.get('/export/json', ExpensesHandler.exportJson);
router.get('/export/csv', ExpensesHandler.exportCsv);
router.get('/template', ExpensesHandler.downloadTemplate);
router.post('/import', uploadContactCsv.single('file'), ExpensesHandler.bulkImportCsv);

router.get(
  '/:id',
  validateRequest({ params: idParamSchema }),
  ExpensesHandler.getById
);

router.patch(
  '/:id',
  validateRequest({
    params: idParamSchema,
    body: z.object({}).passthrough(),
  }),
  ExpensesHandler.update
);

router.post(
  '/:id/post',
  validateRequest({
    params: idParamSchema,
    body: z.object({ orchid: z.string().optional() }),
  }),
  ExpensesHandler.post
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
  ExpensesHandler.pay
);

router.delete(
  '/:id',
  validateRequest({ params: idParamSchema }),
  ExpensesHandler.remove
);

export default router;
