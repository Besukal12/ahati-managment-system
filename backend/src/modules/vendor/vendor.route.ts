import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import {
  CreateVendorHandler,
  GetVendorHandler,
  ListVendorsHandler,
  UpdateVendorHandler,
  UpdateVendorStatusHandler,
} from "./vendor.controller.js";

const vendorRouter = Router();

vendorRouter.use(requireAuth);
vendorRouter.get("/", ListVendorsHandler);
vendorRouter.post("/", CreateVendorHandler);
vendorRouter.get("/:id", GetVendorHandler);
vendorRouter.patch("/:id", UpdateVendorHandler);
vendorRouter.patch("/:id/status", UpdateVendorStatusHandler);

export default vendorRouter;