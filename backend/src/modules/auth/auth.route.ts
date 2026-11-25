import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import {
  BootstrapAdminHandler,
  ChangePasswordHandler,
  GetCurrentUserHandler,
  LoginHandler,
  LogoutHandler,
  RefreshTokenHandler,
} from "./auth.controller.js";

const authRouter = Router();

authRouter.post("/bootstrap", BootstrapAdminHandler);
authRouter.post("/login", LoginHandler);
authRouter.post("/refresh", RefreshTokenHandler);
authRouter.post("/logout", LogoutHandler);
authRouter.post("/change-password", requireAuth, ChangePasswordHandler);
authRouter.get("/me", requireAuth, GetCurrentUserHandler);

export default authRouter;
