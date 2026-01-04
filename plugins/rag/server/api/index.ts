import Router from "koa-router";
import rag from "./rag";

const router = new Router();
router.use("/plugins", rag.routes());

export default router;
