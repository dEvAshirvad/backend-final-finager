import { createRouter } from '@/configs/serverConfig';
import RecurringHandler from './recurring.handler';
import { z } from 'zod';
import { validateRequest } from '@/middlewares/zod-validate-request';
import { recurringZ } from './recurring.model';

const router = createRouter();

const createSchema = recurringZ.omit({ id: true, createdAt: true, updatedAt: true }).partial();

router.post('/', validateRequest({ body: createSchema }), RecurringHandler.create);
router.get('/', RecurringHandler.list);
router.delete('/:id', RecurringHandler.remove);

export default router;

