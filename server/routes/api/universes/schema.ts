import { z } from "zod";
import { BaseSchema } from "../schema";

export const UniversesListSchema = BaseSchema.extend({
    body: z.object({}),
});

export type UniversesListReq = z.infer<typeof UniversesListSchema>;
