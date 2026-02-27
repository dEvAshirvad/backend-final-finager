import JournalServices from '@/modules/accounting/journal/journal.services';
import { type EventTemplate, type EventInstance } from '../events.model';
import { Types } from 'mongoose';

export async function runJournalPlugin(
  template: EventTemplate,
  instance: EventInstance,
  payload: Record<string, any>,
  context: { organizationId: string; userId?: string; role?: string }
) {
  try {
    const lines: { accountId: string; debit: number; credit: number; narration?: string }[] = [];

    const templateLines = (template.linesRule ?? []) as any[];
    for (const rule of templateLines) {
      const field = rule.amountConfig?.field;
      const operator = rule.amountConfig?.operator ?? 'direct';
      const operand = rule.amountConfig?.operand ?? 0;
      let amount = 0;
      const base = Number(payload[field] ?? 0);
      switch (operator) {
        case '%':
          amount = (base * Number(operand)) / 100;
          break;
        case '+':
          amount = base + Number(operand);
          break;
        case '-':
          amount = base - Number(operand);
          break;
        case '*':
          amount = base * Number(operand);
          break;
        default:
          amount = base;
      }
      amount = Math.round((amount + Number.EPSILON) * 100) / 100;

      const debit = rule.direction === 'debit' ? amount : 0;
      const credit = rule.direction === 'credit' ? amount : 0;
      // build line narration from rule.narrationConfig (array or string)
      let lineNarration = '';
      try {
        if (Array.isArray(rule.narrationConfig)) {
          lineNarration = rule.narrationConfig.join('');
        } else if (typeof rule.narrationConfig === 'string') {
          lineNarration = rule.narrationConfig;
        }
        // replace placeholders like %field% and %reference%
        lineNarration = String(lineNarration).replace(/%([a-zA-Z0-9_]+)%/g, (_, key) =>
          key === 'reference' ? instance.reference : String(payload[key] ?? '')
        );
      } catch (e) {
        lineNarration = '';
      }

      lines.push({
        accountId: String(rule.accountId),
        debit,
        credit,
        narration: lineNarration || undefined,
      });
    }

    // build overall description from template.narrationConfig (string or array)
    let description = `Event ${instance.type} ${instance.reference}`;
    try {
      if (Array.isArray(template.narrationConfig)) {
        description = template.narrationConfig.join('');
      } else if (typeof template.narrationConfig === 'string') {
        description = template.narrationConfig;
      }
      description = String(description).replace(/%([a-zA-Z0-9_]+)%/g, (_, key) =>
        key === 'reference' ? instance.reference : String(payload[key] ?? '')
      );
    } catch (e) {
      // fallback already set
    }

    const journal = await JournalServices.createJournalEntry({
      organizationId: context.organizationId,
      userId: context.userId,
      role: context.role,
      reference: instance.reference,
      description,
      lines,
    } as any);

    return { plugin: 'journal', success: true, resultId: (journal as { journalId?: string }).journalId ?? (journal as { id?: string }).id as string };
  } catch (error) {
    return {
      plugin: 'journal',
      success: false,
      error: (error as Error).message || String(error),
    };
  }
}
