ALTER TABLE "ProposalItem"
ADD COLUMN "vendorPriceMinSnapshot" DECIMAL(12,2),
ADD COLUMN "vendorPriceMaxSnapshot" DECIMAL(12,2),
ADD COLUMN "vendorPriceUnitSnapshot" TEXT,
ADD COLUMN "vendorPriceNotesSnapshot" TEXT;

CREATE UNIQUE INDEX "ProposalItem_proposalId_vendorId_key"
ON "ProposalItem"("proposalId", "vendorId");
