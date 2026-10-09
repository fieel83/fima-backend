// Resolve the server-side Discord binding; never trust a modal account ID.
export async function ticketAccountAccess(prisma, discordUserId, categoryId) {
  if (categoryId === "account_recovery") return { allowed: true, accountId: null, recoveryException: true };
  const account = await prisma.user.findUnique({ where: { discordUserId }, select: { id: true } });
  return { allowed: Boolean(account), accountId: account?.id || null, recoveryException: false };
}

export const TICKET_ACCOUNT_LINK_MESSAGE = "Link your Discord account in https://fimamacro.com/dashboard/connected-accounts before opening this ticket. If you cannot access your account, choose Account recovery. / Önce hesabındaki Discord bağlantısını tamamla. Hesabına erişemiyorsan Account recovery seç.";
