import Router from "koa-router";
import { AppState, AppContext } from "@server/types";
import authenticated from "@server/middlewares/authenticated";
import validate from "@server/middlewares/validate";
import HybridSearchHelper from "../helpers/HybridSearchHelper";
import { RAGSearchSchema } from "./schema";

const router = new Router<AppState, AppContext>();

router.post(
    "rag.search",
    authenticated(),
    validate(RAGSearchSchema),
    async (ctx) => {
        const { user } = ctx.state;
        const {
            query,
            limit,
            threshold,
            collectionId,
            documentId,
            mode,
            vectorWeight,
            keywordWeight,
        } = ctx.request.body;

        const results = await HybridSearchHelper.searchForUser(user, {
            query,
            limit,
            threshold,
            collectionId,
            documentId,
            mode,
            vectorWeight,
            keywordWeight,
        });

        ctx.body = {
            data: results,
            pagination: {
                limit,
                total: results.length,
            },
        };
    }
);

export default router;
