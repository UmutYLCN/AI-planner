import { describe, expect, it } from 'vitest';

import {
  naturalIdempotencySource,
  normalizeTaskInput,
  resolveTaskIdentity,
  sha256Hex,
} from '../src/schemas.js';

const baseTask = {
  title: 'Present perfect tense tekrar et',
  subject: 'English',
  source_skill: 'english-teacher',
  description: 'Konu notlarini gozden gecir.',
  due_date: '2026-08-24',
};

const identityOf = (task: Parameters<typeof normalizeTaskInput>[0]) =>
  resolveTaskIdentity(normalizeTaskInput(task));

describe('deterministic idempotency keys', () => {
  it('derives the same document id for the same task', async () => {
    const first = await identityOf(baseTask);
    const second = await identityOf(baseTask);
    expect(first.documentId).toBe(second.documentId);
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
  });

  it('is stable across runs (pinned hash)', async () => {
    const identity = await identityOf(baseTask);
    const expected = await sha256Hex(`k0:${naturalIdempotencySource(normalizeTaskInput(baseTask))}`);
    expect(identity.documentId).toBe(expected);
    expect(identity.documentId).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ignores case and whitespace differences in the natural key', async () => {
    const a = await identityOf(baseTask);
    const b = await identityOf({
      ...baseTask,
      title: '  Present   Perfect   Tense   Tekrar   Et ',
      subject: 'english',
      source_skill: 'English-Teacher',
    });
    expect(a.documentId).toBe(b.documentId);
  });

  it('ignores the description, which is free-form detail rather than identity', async () => {
    const a = await identityOf(baseTask);
    const b = await identityOf({ ...baseTask, description: 'Completely different notes.' });
    expect(a.documentId).toBe(b.documentId);
  });

  it('produces a different id for a different due date', async () => {
    const a = await identityOf(baseTask);
    const b = await identityOf({ ...baseTask, due_date: '2026-08-25' });
    expect(a.documentId).not.toBe(b.documentId);
  });

  it('produces a different id for a different subject, title or source skill', async () => {
    const base = await identityOf(baseTask);
    for (const override of [
      { subject: 'Math' },
      { title: 'Past perfect tekrar et' },
      { source_skill: 'math-teacher' },
    ]) {
      const other = await identityOf({ ...baseTask, ...override });
      expect(other.documentId, JSON.stringify(override)).not.toBe(base.documentId);
    }
  });
});

describe('explicit idempotency keys', () => {
  it('uses the caller key and stores it verbatim', async () => {
    const identity = await identityOf({
      ...baseTask,
      idempotency_key: 'english-teacher:2026-08-24:present-perfect-review',
    });
    expect(identity.idempotencyKey).toBe('english-teacher:2026-08-24:present-perfect-review');
    expect(identity.documentId).toBe(await sha256Hex('k1:english-teacher:2026-08-24:present-perfect-review'));
  });

  it('maps the same explicit key to the same document even when other fields change', async () => {
    const a = await identityOf({ ...baseTask, idempotency_key: 'stable-key' });
    const b = await identityOf({
      ...baseTask,
      title: 'Reworded but same task',
      due_date: '2026-09-01',
      idempotency_key: 'stable-key',
    });
    expect(a.documentId).toBe(b.documentId);
  });

  it('namespaces explicit keys away from derived keys', async () => {
    const natural = naturalIdempotencySource(normalizeTaskInput(baseTask));
    const derived = await identityOf(baseTask);
    // An attacker-style key crafted to equal another task's natural key must not collide.
    const explicit = await identityOf({ ...baseTask, idempotency_key: natural });
    expect(explicit.documentId).not.toBe(derived.documentId);
  });

  it('marks derived keys with an auto: prefix so they are distinguishable', async () => {
    const derived = await identityOf(baseTask);
    expect(derived.idempotencyKey).toMatch(/^auto:[0-9a-f]{64}$/);
  });
});
