import { BlockList, isIP } from 'node:net';
import type { AttendanceVerification, WorkLocation } from '@prisma/client';

/** Normalises `::ffff:1.2.3.4` and trims; returns null for anything that is not an IP address. */
export function cleanIp(raw: string | undefined | null): string | null {
  const ip = (raw ?? '').trim().replace(/^::ffff:/i, '');
  return isIP(ip) ? ip : null;
}

/** Is `ip` inside any of the given single-IP / CIDR rules? Malformed rules are ignored, never matched. */
export function ipInRules(ip: string | null, rules: string[]): boolean {
  if (!ip) return false;
  const list = new BlockList();
  const fam = (a: string) => (isIP(a) === 6 ? 'ipv6' : 'ipv4') as 'ipv4' | 'ipv6';
  for (const rule of rules) {
    const [addr, bits] = rule.trim().split('/');
    if (!isIP(addr)) continue;
    if (bits === undefined) list.addAddress(addr, fam(addr));
    else {
      const n = Number(bits);
      if (Number.isInteger(n) && n >= 0 && n <= (fam(addr) === 'ipv6' ? 128 : 32)) list.addSubnet(addr, n, fam(addr));
    }
  }
  return list.check(ip, fam(ip));
}

export const isValidRule = (rule: string) => {
  const [addr, bits] = rule.trim().split('/');
  if (!isIP(addr)) return false;
  if (bits === undefined) return true;
  const n = Number(bits);
  return /^\d+$/.test(bits) && n >= 0 && n <= (isIP(addr) === 6 ? 128 : 32);
};

export interface VerifyInput {
  location: WorkLocation;
  ip: string | null;
  networkRules: string[]; // active approved office networks
  deviceStatus: 'trusted' | 'pending' | 'revoked' | 'unknown'; // 'unknown' = client sent no device id
  remoteApproved: boolean;
}

/**
 * Decides how confident we are about where a working session is happening.
 * A browser/app cannot prove physical location from an IP, so anything we cannot positively
 * confirm becomes `needs_review` for HR rather than being rejected.
 */
export function verifyWorkplace(i: VerifyInput): { verification: AttendanceVerification; reason: string } {
  if (i.deviceStatus === 'revoked') return { verification: 'needs_review', reason: 'Device access was revoked' };
  if (i.location === 'remote') {
    return i.remoteApproved
      ? { verification: 'verified', reason: 'HR-approved remote-work arrangement' }
      : { verification: 'needs_review', reason: 'No approved remote-work arrangement' };
  }
  if (!i.networkRules.length) return { verification: 'needs_review', reason: 'No approved office networks are configured' };
  if (!ipInRules(i.ip, i.networkRules)) return { verification: 'needs_review', reason: 'Network not recognised as an approved workplace network' };
  if (i.deviceStatus === 'pending') return { verification: 'needs_review', reason: 'Device is awaiting HR trust approval' };
  return { verification: 'verified', reason: i.deviceStatus === 'trusted' ? 'Approved network and trusted device' : 'Approved network' };
}
