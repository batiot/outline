import Router from "koa-router";
import auth from "@server/middlewares/authentication";
import validate from "@server/middlewares/validate";
import { Universe } from "@server/models";
import { presentUniverse } from "@server/presenters";
import type { APIContext } from "@server/types";
import * as T from "./schema";

const router = new Router();

router.post("universes.list", auth(), validate(T.UniversesListSchema), async (ctx: APIContext<T.UniversesListReq>) => {
    const { user } = ctx.state.auth;
    const universes = await Universe.findAll({
        where: {
            teamId: user.teamId,
        },
        order: [["name", "ASC"]],
    });

    ctx.body = {
        data: universes.map(presentUniverse),
    };
});

export default router;
