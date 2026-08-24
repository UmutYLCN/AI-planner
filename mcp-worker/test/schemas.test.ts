import { describe, expect, it } from 'vitest';

import {
  MAX_DESCRIPTION_LENGTH,
  MAX_RANGE_DAYS,
  MAX_TASKS_PER_CALL,
  MAX_TITLE_LENGTH,
  addTasksInputSchema,
  formatValidationError,
  inclusiveDaySpan,
  isCalendarDate,
  listTasksInputSchema,
  normalizeTaskInput,
} from '../src/schemas.js';

const validTask = {
  title: 'Present perfect tense tekrar et',
  subject: 'English',
  source_skill: 'english-teacher',
  description: 'Konu notlarini gozden gecir ve 20 soru coz.',
  due_date: '2026-08-24',
};

describe('isCalendarDate', () => {
  it('accepts real YYYY-MM-DD dates', () => {
    expect(isCalendarDate('2026-08-24')).toBe(true);
    expect(isCalendarDate('2024-02-29')).toBe(true);
  });

  it('rejects malformed or impossible dates', () => {
    for (const value of [
      '2026-8-24',
      '24-08-2026',
      '2026-13-01',
      '2026-02-30',
      '2025-02-29',
      '2026-00-10',
      '2026-08-24T00:00:00Z',
      '',
      'tomorrow',
    ]) {
      expect(isCalendarDate(value), value).toBe(false);
    }
  });
});

describe('inclusiveDaySpan', () => {
  it('counts both endpoints', () => {
    expect(inclusiveDaySpan('2026-08-24', '2026-08-24')).toBe(1);
    expect(inclusiveDaySpan('2026-08-24', '2026-08-25')).toBe(2);
  });

  it('is unaffected by DST transitions in Europe/Istanbul', () => {
    // Istanbul is permanent UTC+3, but the span math must be timezone-free regardless.
    expect(inclusiveDaySpan('2026-03-01', '2026-04-01')).toBe(32);
  });
});

describe('add_tasks input validation', () => {
  it('accepts a well-formed batch', () => {
    const result = addTasksInputSchema.safeParse({ tasks: [validTask] });
    expect(result.success).toBe(true);
  });

  it('rejects an empty task list', () => {
    const result = addTasksInputSchema.safeParse({ tasks: [] });
    expect(result.success).toBe(false);
    expect(formatValidationError(result.error!)).toContain('at least one task');
  });

  it(`rejects more than ${MAX_TASKS_PER_CALL} tasks`, () => {
    const tasks = Array.from({ length: MAX_TASKS_PER_CALL + 1 }, (_, index) => ({
      ...validTask,
      title: `Task ${index}`,
    }));
    const result = addTasksInputSchema.safeParse({ tasks });
    expect(result.success).toBe(false);
    expect(formatValidationError(result.error!)).toContain(`at most ${MAX_TASKS_PER_CALL} tasks`);
  });

  it(`accepts exactly ${MAX_TASKS_PER_CALL} tasks`, () => {
    const tasks = Array.from({ length: MAX_TASKS_PER_CALL }, (_, index) => ({
      ...validTask,
      title: `Task ${index}`,
    }));
    expect(addTasksInputSchema.safeParse({ tasks }).success).toBe(true);
  });

  it('rejects an invalid due_date', () => {
    const result = addTasksInputSchema.safeParse({ tasks: [{ ...validTask, due_date: '2026-02-30' }] });
    expect(result.success).toBe(false);
    expect(formatValidationError(result.error!)).toContain('due_date');
  });

  it('rejects a blank or whitespace-only title', () => {
    for (const title of ['', '   ']) {
      const result = addTasksInputSchema.safeParse({ tasks: [{ ...validTask, title }] });
      expect(result.success, title).toBe(false);
    }
  });

  it(`rejects a title longer than ${MAX_TITLE_LENGTH} characters`, () => {
    const result = addTasksInputSchema.safeParse({
      tasks: [{ ...validTask, title: 'x'.repeat(MAX_TITLE_LENGTH + 1) }],
    });
    expect(result.success).toBe(false);
    expect(formatValidationError(result.error!)).toContain('title');
  });

  it('rejects missing subject and source_skill', () => {
    const { subject: _subject, source_skill: _skill, ...withoutRequired } = validTask;
    expect(addTasksInputSchema.safeParse({ tasks: [withoutRequired] }).success).toBe(false);
  });

  it('allows an omitted description but caps its length', () => {
    const { description: _description, ...withoutDescription } = validTask;
    expect(addTasksInputSchema.safeParse({ tasks: [withoutDescription] }).success).toBe(true);
    expect(
      addTasksInputSchema.safeParse({
        tasks: [{ ...validTask, description: 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1) }],
      }).success,
    ).toBe(false);
  });

  it('ignores caller-supplied status and timestamps', () => {
    const result = addTasksInputSchema.safeParse({
      tasks: [{ ...validTask, status: 'done', created_at: '2020-01-01', completed_at: '2020-01-01' }],
    });
    expect(result.success).toBe(true);
    expect(result.data!.tasks[0]).not.toHaveProperty('status');
    expect(result.data!.tasks[0]).not.toHaveProperty('created_at');
    expect(result.data!.tasks[0]).not.toHaveProperty('completed_at');
  });
});

describe('normalizeTaskInput', () => {
  it('trims and collapses whitespace', () => {
    const normalized = normalizeTaskInput({
      ...validTask,
      title: '  Present   perfect  tekrar  ',
      subject: ' English ',
      source_skill: ' english-teacher ',
    });
    expect(normalized.title).toBe('Present perfect tekrar');
    expect(normalized.subject).toBe('English');
    expect(normalized.source_skill).toBe('english-teacher');
  });

  it('turns a missing or blank idempotency_key into null', () => {
    expect(normalizeTaskInput(validTask).explicitIdempotencyKey).toBeNull();
    expect(normalizeTaskInput({ ...validTask, idempotency_key: '   ' }).explicitIdempotencyKey).toBeNull();
    expect(normalizeTaskInput({ ...validTask, idempotency_key: ' abc ' }).explicitIdempotencyKey).toBe('abc');
  });

  it('defaults a missing description to an empty string', () => {
    const { description: _description, ...withoutDescription } = validTask;
    expect(normalizeTaskInput(withoutDescription).description).toBe('');
  });
});

describe('list_tasks input validation', () => {
  it('accepts a range inside the limit', () => {
    expect(listTasksInputSchema.safeParse({ from: '2026-08-23', to: '2026-08-30' }).success).toBe(true);
  });

  it(`accepts exactly ${MAX_RANGE_DAYS} days`, () => {
    expect(listTasksInputSchema.safeParse({ from: '2026-01-01', to: '2026-03-31' }).success).toBe(true);
  });

  it(`rejects a range longer than ${MAX_RANGE_DAYS} days`, () => {
    const result = listTasksInputSchema.safeParse({ from: '2026-01-01', to: '2026-06-01' });
    expect(result.success).toBe(false);
    expect(formatValidationError(result.error!)).toContain(`${MAX_RANGE_DAYS} days`);
  });

  it('rejects a reversed range', () => {
    const result = listTasksInputSchema.safeParse({ from: '2026-08-30', to: '2026-08-23' });
    expect(result.success).toBe(false);
  });

  it('requires both endpoints', () => {
    expect(listTasksInputSchema.safeParse({ from: '2026-08-23' }).success).toBe(false);
    expect(listTasksInputSchema.safeParse({ to: '2026-08-23' }).success).toBe(false);
  });

  it('only accepts todo/done for status', () => {
    expect(listTasksInputSchema.safeParse({ from: '2026-08-23', to: '2026-08-24', status: 'todo' }).success).toBe(true);
    expect(listTasksInputSchema.safeParse({ from: '2026-08-23', to: '2026-08-24', status: 'done' }).success).toBe(true);
    expect(listTasksInputSchema.safeParse({ from: '2026-08-23', to: '2026-08-24', status: 'archived' }).success).toBe(
      false,
    );
  });
});
