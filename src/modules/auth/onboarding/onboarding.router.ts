import { createRouter } from '@/configs/serverConfig';
import OnboardingHandler from './onboarding.handler';
import { validateRequest } from '@/middlewares/zod-validate-request';
import { z } from 'zod';
const router = createRouter();

router.post(
  '/choose-role',
  validateRequest({
    body: z.object({ role: z.enum(['ca', 'owner', 'staff']) }),
  }),
  OnboardingHandler.chooseRole
);

router.post(
  '/get-verify-ca',
  validateRequest({
    body: z.object({ caId: z.string() }),
  }),
  OnboardingHandler.verifyCa
);

router.post(
  '/generate-org-code',
  validateRequest({
    body: z.object({ name: z.string(), slug: z.string() }),
  }),
  OnboardingHandler.generateOrgCode
);

router.post(
  '/check-org-code-availability',
  validateRequest({
    body: z.object({ orgCode: z.string() }),
  }),
  OnboardingHandler.checkOrgCodeAvailability
);

router.get('/get-onboarding-status', OnboardingHandler.getOnboardingStatus);

router.post(
  '/complete-onboarding',
  validateRequest({ body: z.object({ organizationId: z.string() }) }),
  OnboardingHandler.completeOnboarding
);

router.post(
  '/set-active-organization',
  validateRequest({
    body: z.object({
      organizationId: z.string().optional(),
      organizationSlug: z.string().optional(),
    }),
  }),
  OnboardingHandler.setActiveOrganization
);

export default router;
