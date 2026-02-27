import { RecurringModel } from './recurring.model';
import { EventTemplateModel } from './events.model';
import DispatcherService from './dispatcher.service';
import { Types } from 'mongoose';

type TimerRef = { timeout?: NodeJS.Timeout; longTimeout?: NodeJS.Timeout };

const MAX_TIMEOUT = 2147483647; // max setTimeout ~24.8 days

function parseTimeHM(time?: string) {
  if (!time) return { h: 0, m: 0 };
  const [h, m] = time.split(':').map((s) => parseInt(s, 10));
  return { h: isNaN(h) ? 0 : h, m: isNaN(m) ? 0 : m };
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function computeNextRun(now: Date, schedule: any): Date {
  const { type, time, dayOfWeek, dayOfMonth } = schedule;
  const { h, m } = parseTimeHM(time);
  const candidate = new Date(now);
  candidate.setHours(h, m, 0, 0);
  if (type === 'daily') {
    if (candidate > now) return candidate;
    return addDays(candidate, 1);
  }
  if (type === 'weekly') {
    const dow = typeof dayOfWeek === 'number' ? dayOfWeek : 1;
    let days = (dow - candidate.getDay() + 7) % 7;
    if (days === 0 && candidate <= now) days = 7;
    return addDays(candidate, days);
  }
  if (type === 'monthly') {
    const dom = typeof dayOfMonth === 'number' ? dayOfMonth : 1;
    const year = candidate.getFullYear();
    const month = candidate.getMonth();
    const dim = daysInMonth(year, month);
    const day = Math.min(dom, dim);
    const run = new Date(candidate);
    run.setDate(day);
    run.setHours(h, m, 0, 0);
    if (run > now) return run;
    // next month
    const nextMonth = new Date(year, month + 1, 1);
    const dim2 = daysInMonth(nextMonth.getFullYear(), nextMonth.getMonth());
    const day2 = Math.min(dom, dim2);
    nextMonth.setDate(day2);
    nextMonth.setHours(h, m, 0, 0);
    return nextMonth;
  }
  // calendar_monthly -> last day of month at time
  const year = candidate.getFullYear();
  const month = candidate.getMonth();
  const last = daysInMonth(year, month);
  const run = new Date(candidate);
  run.setDate(last);
  run.setHours(h, m, 0, 0);
  if (run > now) return run;
  const nextMonth = new Date(year, month + 1, 1);
  const last2 = daysInMonth(nextMonth.getFullYear(), nextMonth.getMonth());
  nextMonth.setDate(last2);
  nextMonth.setHours(h, m, 0, 0);
  return nextMonth;
}

class RecurringScheduler {
  timers: Map<string, TimerRef> = new Map();

  async scheduleAll() {
    const items = await RecurringModel.find({ enabled: true }).lean().exec();
    for (const it of items) {
      this.scheduleOne(it as any);
    }
  }

  clearTimer(id: string) {
    const t = this.timers.get(id);
    if (!t) return;
    if (t.timeout) clearTimeout(t.timeout);
    if (t.longTimeout) clearTimeout(t.longTimeout);
    this.timers.delete(id);
  }

  scheduleOne(item: any) {
    try {
      this.clearTimer(String(item._id));
      const now = new Date();
      const next = computeNextRun(now, item.schedule);
      const diff = next.getTime() - now.getTime();
      const timerRef: TimerRef = {};
      const scheduleFn = async () => {
        try {
          // dispatch
          const tmpl = await EventTemplateModel.findById(item.templateId).lean().exec();
          if (!tmpl) return;
          await DispatcherService.dispatchEvent(String(item.organizationId), tmpl.orchid, item.payload ?? {}, { userId: String(item.createdBy ?? ''), role: 'system' });
          await RecurringModel.findByIdAndUpdate(item._id, { $set: { lastRun: new Date() }, $inc: { runCount: 1 } }).exec();
        } catch (err) {
          // log and continue
        } finally {
          // schedule next
          const updated = await RecurringModel.findById(item._id).lean().exec();
          if (!updated || !updated.enabled) return;
          const nextRun = computeNextRun(new Date(), updated.schedule);
          await RecurringModel.findByIdAndUpdate(item._id, { $set: { nextRun } }).exec();
          this.scheduleOne(updated);
        }
      };

      if (diff <= MAX_TIMEOUT) {
        timerRef.timeout = setTimeout(scheduleFn, diff);
      } else {
        // long wait: set intermediate timeout to re-evaluate
        timerRef.longTimeout = setTimeout(() => this.scheduleOne(item), MAX_TIMEOUT);
      }
      this.timers.set(String(item._id), timerRef);
    } catch (err) {
      // ignore scheduling errors
    }
  }

  async createAndSchedule(payload: any) {
    const doc = await RecurringModel.create(payload);
    this.scheduleOne(doc);
    return doc.toObject();
  }

  async cancel(id: string) {
    this.clearTimer(id);
  }
}

export const RecurringSchedulerInstance = new RecurringScheduler();

// auto-start scheduler
setImmediate(() => {
  RecurringSchedulerInstance.scheduleAll().catch(() => {});
});

export default RecurringSchedulerInstance;

