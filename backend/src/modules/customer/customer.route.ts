import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import {
  CreateCustomerHandler,
  DeleteCustomerHandler,
  GetCustomerHandler,
  ListCustomersHandler,
  UpdateCustomerHandler,
} from "./customer.controller.js";

const customerRouter = Router();

customerRouter.use(requireAuth);
customerRouter.get("/", ListCustomersHandler);
customerRouter.post("/", CreateCustomerHandler);
customerRouter.get("/:id", GetCustomerHandler);
customerRouter.patch("/:id", UpdateCustomerHandler);
customerRouter.delete("/:id", DeleteCustomerHandler);

export default customerRouter;
