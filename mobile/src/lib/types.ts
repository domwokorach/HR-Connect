export type Role = 'admin' | 'manager' | 'staff';
export type WorkLocation = 'office' | 'remote';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'remote' | 'on_leave' | 'public_holiday';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type TrainingStatus = 'not_started' | 'in_progress' | 'completed' | 'overdue';
export type CandidateStatus = 'applied' | 'screening' | 'interview' | 'offered' | 'hired' | 'rejected';
export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'intern';
export type EmployeeStatus = 'active' | 'inactive' | 'on_leave';

export interface Department { id: string; name: string }
export interface Employee {
  id: string; employeeCode: string; fullName: string; email: string; jobTitle: string; departmentId: string | null;
  department?: { id: string; name: string } | null; managerId: string | null; employmentType: EmploymentType; startDate: string;
  status: EmployeeStatus; scheduleId: string | null; country: string; hasLogin: boolean; loginRole?: 'ADMIN' | 'MANAGER' | 'STAFF' | null;
  // confidential — only present for HR and the employee themself
  phone?: string | null; homeAddress?: string | null; salary?: number; currency?: string;
}
export interface WorkSchedule { id: string; name: string; workDays: number[]; startTime: string; endTime: string; unpaidBreakMinutes: number }
export interface CompanySettings { companyName: string; timezone: string; country: string; lateGraceMinutes: number; overtimeMultiplier: number; retentionMonths: number }
export interface AttendanceBreak { id: string; attendanceId: string; startedAt: string; endedAt: string | null }
export interface AttendanceRecord {
  id: string; employeeId: string; workDate: string; clockIn: string | null; clockOut: string | null; workLocation: WorkLocation | null;
  scheduledMinutes: number; breakMinutes: number; workedMinutes: number; lateMinutes: number; earlyDepartureMinutes: number;
  overtimeMinutes: number; overtimeStatus: 'none' | 'pending' | 'approved' | 'rejected'; status: AttendanceStatus; notes: string | null;
  breaks?: AttendanceBreak[]; employee?: { fullName: string; departmentId?: string | null };
}
export interface Correction {
  id: string; employeeId: string; workDate: string; requestedClockIn: string; requestedClockOut: string; workLocation: WorkLocation;
  reason: string; status: 'pending' | 'approved' | 'rejected'; createdAt: string; employee?: { fullName: string };
}
export interface Holiday { id: string; holidayDate: string; name: string; country: string }
export interface LeaveType { id: string; name: string; isPaid: boolean; defaultDays: number; requiresDocument: boolean; tracksBalance: boolean; color: string }
export interface LeaveRequest {
  id: string; employeeId: string; leaveTypeId: string; startDate: string; endDate: string; workingDays: number; reason: string | null;
  documentId: string | null; status: LeaveStatus; reviewNote: string | null; createdAt: string; leaveType?: LeaveType; employee?: { fullName: string };
}
export interface LeaveBalance { id: string; employeeId: string; leaveTypeId: string; year: number; entitled: number; used: number; leaveType?: LeaveType }
export interface PayrollItem {
  id: string; payrollId: string; employeeId: string; basicSalary: number; allowances: number; bonuses: number; overtimePay: number;
  deductions: number; grossPay: number; netPay: number; paymentStatus: string; employee?: { fullName: string; employeeCode: string };
}
export interface Payroll { id: string; periodStart: string; periodEnd: string; status: 'draft' | 'approved' | 'paid'; approvedAt: string | null; paidAt: string | null; items: PayrollItem[] }
export interface Payslip {
  id: string; employeeId: string; periodStart: string; periodEnd: string; basicSalary: number; allowances: number; bonuses: number;
  overtimePay: number; deductions: number; deductionBreakdown: { name: string; amount: number }[]; grossPay: number; netPay: number; paymentStatus: string;
}
export interface DeductionRule { id: string; name: string; country: string; employmentType: EmploymentType | null; kind: 'percent_of_gross' | 'fixed'; value: number; active: boolean }
export interface JobPosting { id: string; title: string; departmentId: string | null; location: string | null; employmentType: EmploymentType; description: string | null; status: 'draft' | 'open' | 'closed'; createdAt: string; department?: { name: string } | null; _count?: { applications: number } }
export interface Candidate { id: string; fullName: string; email: string; phone: string | null; resumeId: string | null; notes: string | null }
export interface Interview { id: string; applicationId: string; interviewerId: string | null; scheduledAt: string; mode: string; notes: string | null; score: number | null; feedback: string | null; interviewer?: { fullName: string } | null }
export interface Application {
  id: string; jobId: string; candidateId: string; status: CandidateStatus; rating: number | null; evaluation: string | null; offerSalary: number | null;
  hiringApproved: boolean; hiredEmployeeId: string | null; createdAt: string; candidate: Candidate; interviews: Interview[]; job: { title: string };
}
export interface TrainingCourse { id: string; code: string; title: string; description: string | null; durationHours: number }
export interface TrainingAssignment {
  id: string; trainingId: string; employeeId: string; assignedDate: string; dueDate: string; completionDate: string | null; progress: number; status: TrainingStatus;
  employee?: { fullName: string; departmentId: string | null; department?: { name: string } | null }; training?: { title: string; code: string };
}
export interface Benefit { id: string; name: string; category: string; description: string | null; monthlyCost?: number; isAllowance: boolean; eligibility: string }
export interface EmployeeBenefit { id: string; employeeId: string; benefitId: string; status: 'pending' | 'enrolled' | 'ended'; startDate: string; monthlyCost: number; employee?: { fullName: string } }
export interface AppNotification { id: string; title: string; body: string | null; kind: string; isRead: boolean; createdAt: string }
export interface AuditLog { id: string; actorId: string | null; action: string; entity: string; entityId: string | null; createdAt: string }
