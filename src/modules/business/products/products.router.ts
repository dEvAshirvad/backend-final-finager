import { createRouter } from '@/configs/serverConfig';
import { validateRequest } from '@/middlewares/zod-validate-request';
import { z } from 'zod';
import ProductsHandler from './products.handler';
import { productZodCreateSchema, productZodUpdateSchema } from './products.model';
import { uploadContactCsv } from '@/configs/multer';

const router = createRouter();

const listQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  tags: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc', '1', '-1']).optional(),
});

router.post(
  '/',
  validateRequest({ body: productZodCreateSchema }),
  ProductsHandler.create
);
router.post(
  '/:id/stock-adjust',
  validateRequest({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
      type: z.enum(['STOCK_IN', 'STOCK_OUT', 'STOCK_ADJUSTED']),
      variant: z.string().optional(), // optional — if omitted, treat as product-level (not recommended)
      orchid: z.string().optional(),
      qty: z.number().min(0),
      reason: z.string().optional(),
      costPrice: z.number().optional(),
    }),
  }),
  ProductsHandler.stockAdjust
);

router.get('/', validateRequest({ query: listQuerySchema }), ProductsHandler.list);

// static routes before :id
router.get('/export/json', ProductsHandler.exportJson);
router.get('/export/csv', ProductsHandler.exportCsv);
router.get('/template', ProductsHandler.downloadTemplate);
router.post('/import', uploadContactCsv.single('file'), ProductsHandler.bulkImportCsv);

router.get(
  '/:id',
  validateRequest({ params: z.object({ id: z.string().min(1) }) }),
  ProductsHandler.getById
);

router.patch(
  '/:id',
  validateRequest({ params: z.object({ id: z.string().min(1) }), body: productZodUpdateSchema.partial() }),
  ProductsHandler.update
);

router.delete(
  '/:id',
  validateRequest({ params: z.object({ id: z.string().min(1) }) }),
  ProductsHandler.remove
);

export default router;

