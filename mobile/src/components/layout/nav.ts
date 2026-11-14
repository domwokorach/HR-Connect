import type { HRIconName } from '@/components/ui/hr-icon-map';
import type { Role } from '@/lib/types';

export interface NavItem { href: string; label: string; short: string; icon: HRIconName; roles: Role[]; group: string; mobileTab?: boolean }
const all: Role[] = ['admin', 'manager', 'staff'];

export const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', short: 'Dashboard', icon: 'dashboard', roles: all, group: 'Main Workspace', mobileTab: true },
  { href: '/attendance', label: 'Time & Attendance', short: 'Attendance', icon: 'clock', roles: all, group: 'Main Workspace', mobileTab: true },
  { href: '/leave', label: 'Leave Management', short: 'Leave', icon: 'calendar', roles: all, group: 'Main Workspace', mobileTab: true },
  { href: '/employees', label: 'Employees', short: 'Employees', icon: 'employees', roles: all, group: 'Main Workspace', mobileTab: true },
  { href: '/departments', label: 'Departments', short: 'Departments', icon: 'departments', roles: ['admin', 'manager'], group: 'Main Workspace' },
  { href: '/recruitment', label: 'Recruitment', short: 'Recruitment', icon: 'recruitment', roles: ['admin'], group: 'People Operations' },
  { href: '/training', label: 'Training', short: 'Training', icon: 'training', roles: all, group: 'People Operations' },
  { href: '/benefits', label: 'Employee Benefits', short: 'Benefits', icon: 'benefits', roles: all, group: 'People Operations' },
  { href: '/payroll', label: 'Payroll', short: 'Payroll', icon: 'wallet', roles: all, group: 'People Operations' },
  { href: '/reports', label: 'Reports & Analytics', short: 'Reports', icon: 'reports', roles: ['admin', 'manager'], group: 'Analytics & Management' },
  { href: '/settings', label: 'Settings', short: 'Settings', icon: 'settings', roles: all, group: 'Account & Settings' },
];

/** Destinations shown as dock tabs, in order; every other authorised route lives on the More screen. */
export const DOCK_TABS = ['/', '/attendance', '/leave', '/employees'] as const;

export const navFor = (role: Role) => NAV.filter((n) => n.roles.includes(role));
export const labelFor = (n: NavItem, role: Role) => (n.href === '/payroll' && role !== 'admin' ? 'My Payslips' : n.label);
export const isActive = (href: string, path: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
export const groupsFor = (role: Role) => {
  const out: { name: string; items: NavItem[] }[] = [];
  for (const n of navFor(role)) {
    const g = out.find((x) => x.name === n.group);
    if (g) g.items.push(n); else out.push({ name: n.group, items: [n] });
  }
  return out;
};
