-- CreateEnum
CREATE TYPE "AccessScope" AS ENUM ('CONTACT', 'COMPENSATION');

-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING_STAFF', 'PENDING_HR', 'APPROVED', 'DECLINED_BY_STAFF', 'REJECTED_BY_HR', 'CANCELLED', 'REVOKED');

-- CreateTable
CREATE TABLE "StaffAccessRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "scopes" "AccessScope"[],
    "durationDays" INTEGER NOT NULL,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING_STAFF',
    "staffNote" TEXT,
    "staffDecidedAt" TIMESTAMP(3),
    "hrReviewerId" TEXT,
    "hrNote" TEXT,
    "hrDecidedAt" TIMESTAMP(3),
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffAccessRequest_requesterId_status_idx" ON "StaffAccessRequest"("requesterId", "status");

-- CreateIndex
CREATE INDEX "StaffAccessRequest_subjectId_status_idx" ON "StaffAccessRequest"("subjectId", "status");

-- CreateIndex
CREATE INDEX "StaffAccessRequest_status_idx" ON "StaffAccessRequest"("status");

-- AddForeignKey
ALTER TABLE "StaffAccessRequest" ADD CONSTRAINT "StaffAccessRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAccessRequest" ADD CONSTRAINT "StaffAccessRequest_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
