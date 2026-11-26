import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { ReviewChangeRequestHandler } from "./change.controller.js";

const changeRouter = Router();

changeRouter.use(requireAuth);
changeRouter.patch("/:id", ReviewChangeRequestHandler);

export default changeRouter;
