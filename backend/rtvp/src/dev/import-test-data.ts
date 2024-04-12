import fs from "fs";
import path from "path";
import db from "@/db";
import { realtime_vehicle_position as rtvp } from "@/db/schemas/rtvp";
import { transformRtvp } from "@/utils/rtvp";
import { RawRTVP } from "@/types/rtvp";

const TEST_DATA_DIR = path.resolve("../../", "proof-of-concept/tmp_data");

const testDataFiles = fs
    .readdirSync(TEST_DATA_DIR)
    .filter((fileName) => fileName.startsWith("rtvp_") && fileName.endsWith(".json"))
    .map((fileName) => {
        const filePath = path.join(TEST_DATA_DIR, fileName);
        const fileContent = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(fileContent);
    });

testDataFiles.forEach(async (rtvpList) => {
    const dbRtvp = await Promise.allSettled(rtvpList.map((rtvp: RawRTVP) => transformRtvp(rtvp)));

    // const dbRtvpResolved = dbRtvp
    //     .filter(
    //         (result): result is PromiseFulfilledResult<typeof rtvp.$inferInsert> =>
    //             result.status === "fulfilled"
    //     )
    //     .map((result) => result.value as typeof rtvp.$inferInsert);
    console.log(dbRtvp);
});
