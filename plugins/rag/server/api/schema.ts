import { z } from "zod";
import { BaseSchema } from "@server/routes/api/schema";

export const RAGSearchSchema = BaseSchema.extend({
    body: z.object({
        query: z.string().min(3).max(1000),
        limit: z.number().min(1).max(50).default(10),
        threshold: z.number().min(0).max(1).default(0.7),
        collectionId: z.string().uuid().optional(),
        documentId: z.string().uuid().optional(),
        includeContext: z.boolean().default(true),
        mode: z.enum(["vector", "hybrid"]).default("vector"),
        vectorWeight: z.number().min(0).max(1).default(0.7),
        keywordWeight: z.number().min(0).max(1).default(0.3),
    }),
});
