import type { Db } from "../db/client";

export async function checkFeedExist(db: Db, hash: string) {
    const feed = await db.query.feedInfo.findFirst({
        where: {
            hash,
        },
        columns: {
            agencyId: true,
        },
    });

    return !!feed;
}
