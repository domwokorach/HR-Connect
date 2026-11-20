-- AlterEnum
ALTER TYPE "AccessScope" ADD VALUE 'DOCUMENTS';

-- CreateEnum
CREATE TYPE "AttendanceVerification" AS ENUM ('verified', 'needs_review', 'hr_approved', 'hr_rejected');
CREATE TYPE "DeviceStatus" AS ENUM ('pending', 'trusted', 'revoked');

-- AlterTable
ALTER TABLE "StaffAccessRequest" ADD COLUMN "businessReason" TEXT NOT NULL DEFAULT '', ADD COLUMN "lawfulBasis" TEXT;
ALTER TABLE "CompanySettings" ADD COLUMN "checkIntervalMinutes" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "Employee" ADD COLUMN "remoteApproved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Attendance" ADD COLUMN "verification" "AttendanceVerification" NOT NULL DEFAULT 'needs_review', ADD COLUMN "clockInIp" TEXT, ADD COLUMN "clockInDeviceId" TEXT, ADD COLUMN "lastCheckAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "NetworkPolicy" (
    "id" TEXT NOT NULL, "name" TEXT NOT NULL, "cidr" TEXT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NetworkPolicy_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TrustedDevice" (
    "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "deviceId" TEXT NOT NULL, "label" TEXT NOT NULL, "platform" TEXT,
    "status" "DeviceStatus" NOT NULL DEFAULT 'pending', "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AttendanceEvent" (
    "id" TEXT NOT NULL, "attendanceId" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "type" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "ip" TEXT, "deviceId" TEXT,
    "verification" "AttendanceVerification" NOT NULL, "note" TEXT,
    CONSTRAINT "AttendanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrustedDevice_employeeId_deviceId_key" ON "TrustedDevice"("employeeId", "deviceId");
CREATE INDEX "AttendanceEvent_attendanceId_at_idx" ON "AttendanceEvent"("attendanceId", "at");
CREATE INDEX "AttendanceEvent_employeeId_at_idx" ON "AttendanceEvent"("employeeId", "at");

-- AddForeignKey
ALTER TABLE "TrustedDevice" ADD CONSTRAINT "TrustedDevice_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
