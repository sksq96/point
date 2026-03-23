import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel, Id } from "./_generated/dataModel";

export type DbCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>;

export async function getAcceptedFriendIds(ctx: DbCtx, userId: Id<"users">): Promise<Set<Id<"users">>> {
  const friendships = await ctx.db
    .query("friends")
    .withIndex("by_from_user", (q) => q.eq("fromUserId", userId).eq("status", "accepted"))
    .collect();
  const ids = new Set<Id<"users">>();
  for (const f of friendships) ids.add(f.toUserId);
  ids.add(userId);
  return ids;
}

export async function canUserSeeHighlight(
  ctx: DbCtx,
  userId: Id<"users">,
  highlightOwnerId: Id<"users">,
): Promise<boolean> {
  return (await getAcceptedFriendIds(ctx, userId)).has(highlightOwnerId);
}
