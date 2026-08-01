type UserLike = {
  primaryEmailAddress?: { emailAddress?: string | null } | null;
} | null;

function parseList(raw: string | undefined): Set<string> {
  if (!raw) return new Set<string>();
  return new Set(
    raw
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminUser(user: UserLike): boolean {
  if (!user) return false;

  const admins = parseList(process.env.BRIDGE_ADMIN_USERS);
  if (admins.size === 0) return false;

  const email = user.primaryEmailAddress?.emailAddress?.trim().toLowerCase() || '';

  return email ? admins.has(email) : false;
}
