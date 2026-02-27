import { createRouter } from '@/configs/serverConfig';
import EventsHandler from './events.handler';
import { validateRequest } from '@/middlewares/zod-validate-request';
import { z } from 'zod';
import { eventTemplateZod } from './events.model';

const router = createRouter();

const listQuery = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  orchid: z.string().optional(),
  name: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

router.get(
  '/templates',
  validateRequest({ query: listQuery }),
  EventsHandler.listTemplates
);
router.post(
  '/templates',
  validateRequest({
    body: eventTemplateZod.omit({
      id: true,
      createdAt: true,
      updatedAt: true,
      organizationId: true,
    }),
  }),
  EventsHandler.createTemplate
);
router.get('/templates/:orchid', EventsHandler.getTemplate);
router.patch('/templates/:orchid', EventsHandler.updateTemplate);
router.delete('/templates/:orchid', EventsHandler.deleteTemplate);

router.post(
  '/dispatch/:orchid',
  validateRequest({ body: z.object({ payload: z.any() }) }),
  EventsHandler.dispatch
);
router.get('/instances/:id', EventsHandler.getInstance);
router.get('/instances', EventsHandler.getInstances);

export default router;
