import { Router } from "express";
import {
  CreateCustomerChangeHandler,
  GetSharedProposalHandler,
  SaveCustomerSelectionsHandler,
} from "./shared-proposal.controller.js";

const sharedProposalRouter = Router();

sharedProposalRouter.get("/:token", GetSharedProposalHandler);
sharedProposalRouter.post("/:token/selections", SaveCustomerSelectionsHandler);
sharedProposalRouter.post("/:token/changes", CreateCustomerChangeHandler);

export default sharedProposalRouter;
