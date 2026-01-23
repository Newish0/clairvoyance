import * as v from "valibot";

export const vInteger = (message?: string) => v.pipe(v.number(), v.integer(message));
