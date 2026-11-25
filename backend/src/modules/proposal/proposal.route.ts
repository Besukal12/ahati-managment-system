import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import {
  AddProposalItemHandler,
  CreateProposalHandler,
  DeleteProposalHandler,
  GetProposalHandler,
  GetProposalChangesHandler,
  GetProposalSelectionsHandler,
  ListProposalsHandler,
  RevokeProposalShareHandler,
  ShareProposalHandler,
  RemoveProposalItemHandler,
  UpdateProposalHandler,
  UpdateProposalItemHandler,
} from "./proposal.controller.js";

const proposalRouter = Router();

proposalRouter.use(requireAuth);
proposalRouter.get("/", ListProposalsHandler);
proposalRouter.post("/", CreateProposalHandler);
proposalRouter.get("/:id/selections", GetProposalSelectionsHandler);
proposalRouter.get("/:id/changes", GetProposalChangesHandler);
proposalRouter.post("/:id/share", ShareProposalHandler);
proposalRouter.delete("/:id/share", RevokeProposalShareHandler);
proposalRouter.get("/:id", GetProposalHandler);
proposalRouter.patch("/:id", UpdateProposalHandler);
proposalRouter.delete("/:id", DeleteProposalHandler);
proposalRouter.post("/:id/items", AddProposalItemHandler);
proposalRouter.patch("/:id/items/:itemId", UpdateProposalItemHandler);
proposalRouter.delete("/:id/items/:itemId", RemoveProposalItemHandler);

export default proposalRouter;
