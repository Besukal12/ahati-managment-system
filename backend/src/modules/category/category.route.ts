import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import {
  CreateCategoryHandler,
  DeleteCategoryHandler,
  GetCategoryHandler,
  ListCategoriesHandler,
  UpdateCategoryHandler,
} from "./category.controller.js";

const categoryRouter = Router();

categoryRouter.use(requireAuth);
categoryRouter.get("/", ListCategoriesHandler);
categoryRouter.post("/", CreateCategoryHandler);
categoryRouter.get("/:id", GetCategoryHandler);
categoryRouter.patch("/:id", UpdateCategoryHandler);
categoryRouter.delete("/:id", DeleteCategoryHandler);

export default categoryRouter;
