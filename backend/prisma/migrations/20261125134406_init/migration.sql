-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CalculationMethod" AS ENUM ('FIXED', 'EVENT_GUESTS', 'QUANTITY');

-- CreateEnum
CREATE TYPE "CustomerSelection" AS ENUM ('PENDING', 'SELECTED', 'NOT_SELECTED');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('OPEN', 'REVIEWED', 'RESOLVED', 'DECLINED');

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "description" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "social" TEXT,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priceMin" DECIMAL(12,2),
    "priceMax" DECIMAL(12,2),
    "priceUnit" TEXT,
    "priceNotes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingType" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "calculationMethod" "CalculationMethod" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "eventType" TEXT,
    "eventDate" TIMESTAMP(3),
    "location" TEXT,
    "guestCount" INTEGER,
    "budget" DECIMAL(12,2),
    "notes" TEXT,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "validUntil" TIMESTAMP(3),
    "shareToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalItem" (
    "id" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "pricingTypeId" UUID NOT NULL,
    "description" TEXT,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "customerSelection" "CustomerSelection" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "proposalItemId" UUID,
    "message" TEXT NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'OPEN',
    "response" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PricingType_name_key" ON "PricingType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_shareToken_key" ON "Proposal"("shareToken");

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalItem" ADD CONSTRAINT "ProposalItem_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalItem" ADD CONSTRAINT "ProposalItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalItem" ADD CONSTRAINT "ProposalItem_pricingTypeId_fkey" FOREIGN KEY ("pricingTypeId") REFERENCES "PricingType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_proposalItemId_fkey" FOREIGN KEY ("proposalItemId") REFERENCES "ProposalItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
