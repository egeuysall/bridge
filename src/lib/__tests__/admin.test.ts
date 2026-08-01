import { afterEach, describe, expect, test } from 'bun:test';
import { isAdminUser } from '@/lib/admin';

const originalAdmins = process.env.BRIDGE_ADMIN_USERS;

afterEach(() => {
  if (originalAdmins === undefined) delete process.env.BRIDGE_ADMIN_USERS;
  else process.env.BRIDGE_ADMIN_USERS = originalAdmins;
});

describe('admin identity', () => {
  test('matches configured email addresses only', () => {
    process.env.BRIDGE_ADMIN_USERS = 'admin@example.com';

    expect(isAdminUser({ primaryEmailAddress: { emailAddress: 'ADMIN@example.com' } })).toBe(true);
    expect(isAdminUser({ primaryEmailAddress: { emailAddress: 'other@example.com' } })).toBe(false);
  });
});
