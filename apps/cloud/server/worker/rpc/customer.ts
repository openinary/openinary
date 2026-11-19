import type { CustomerData } from "../../shared/autumn.js";
import type { Account } from "../lib/account.js";

/**
 * Name and email for Autumn's customer record, which belongs to the account
 * owner: inside someone else's account a member's details are left out so
 * they can never overwrite the owner's.
 */
export function customerDataOf(context: {
  account: Account;
  session: { user: { name: string; email: string } };
}): CustomerData | undefined {
  if (context.account.memberId) return undefined;
  return { name: context.session.user.name, email: context.session.user.email };
}
