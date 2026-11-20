-- CreateEnum
CREATE TYPE "CardPaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'DECLINED', 'FAILED', 'REVERSED', 'REFUNDED', 'UNDER_REVIEW');

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "providerReference" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "CardPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "providerStatus" TEXT,
    "businessRefType" TEXT,
    "businessRefId" TEXT,
    "createdById" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerReference" TEXT,
    "transactionId" TEXT,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReconciliation" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "providerStatus" TEXT,
    "errorCategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIntegrationStatus" (
    "id" INTEGER NOT NULL,
    "environment" TEXT NOT NULL,
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorCategory" TEXT,
    "lastCheckedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentIntegrationStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_idempotencyKey_key" ON "PaymentTransaction"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_providerReference_key" ON "PaymentTransaction"("providerReference");

-- CreateIndex
CREATE INDEX "PaymentTransaction_status_createdAt_idx" ON "PaymentTransaction"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentTransaction_businessRefType_businessRefId_idx" ON "PaymentTransaction"("businessRefType", "businessRefId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_eventId_key" ON "PaymentEvent"("eventId");

-- CreateIndex
CREATE INDEX "PaymentEvent_providerReference_idx" ON "PaymentEvent"("providerReference");

-- CreateIndex
CREATE INDEX "PaymentEvent_transactionId_idx" ON "PaymentEvent"("transactionId");

-- CreateIndex
CREATE INDEX "PaymentReconciliation_transactionId_createdAt_idx" ON "PaymentReconciliation"("transactionId", "createdAt");

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PaymentTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PaymentTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

