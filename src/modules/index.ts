import { createRouter } from '@/configs/serverConfig';
import onboardingRouter from '@/modules/auth/onboarding/onboarding.router';
import coaRouter from '@/modules/accounting/coa/coa.router';
import journalRouter from '@/modules/accounting/journal/journal.router';
import reportsRouter from '@/modules/accounting/reports/reports.router';
import contactsRouter from '@/modules/business/contacts/contacts.router';
import productsRouter from './business/products/products.router';
import invoicesRouter from './business/transactions/invoices/invoices.router';
import expensesRouter from './business/transactions/expenses/expenses.router';
import eventsRouter from '@/modules/accounting/events/events.router';
import recurringRouter from '@/modules/accounting/events/recurring.router';

const router = createRouter();

router.use('/onboarding', onboardingRouter);
router.use('/accounting/coa', coaRouter);
router.use('/accounting/journal', journalRouter);
router.use('/accounting/reports', reportsRouter);
router.use('/business/contacts', contactsRouter);
router.use('/business/products', productsRouter);
router.use('/business/transactions/invoices', invoicesRouter);
router.use('/business/transactions/expenses', expensesRouter);
router.use('/business/events', eventsRouter);
router.use('/business/events/recurring', recurringRouter);

export default router;
