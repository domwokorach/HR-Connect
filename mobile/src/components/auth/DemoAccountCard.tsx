import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, Text, View } from 'react-native';
import { ArrowRight, Check, Copy, ShieldCheck } from 'lucide-react-native';
import { useToast } from '@/components/ui/toast';
import { DEMO_ADMIN } from '@/lib/demo-credentials';
import { AUTH, useAuthType } from './auth';

const RING = '0 0 0 4px rgba(37,99,235,0.3)';
type PS = { hovered?: boolean; pressed: boolean; focused?: boolean };

/** 32px copy button; shows a success state (and announces it) for 1.6s after copying. */
function CopyButton({ value, label, doneLabel }: { value: string; label: string; doneLabel: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(false), 1600); return () => clearTimeout(t); }, [copied]);
  const copy = async () => {
    await Clipboard.setStringAsync(value);
    setCopied(true);
    if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(doneLabel);
  };
  return (
    <Pressable onPress={copy} hitSlop={6} accessibilityRole="button" accessibilityLabel={copied ? doneLabel : label}
      style={({ hovered, focused }: PS) => ({ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1,
        borderColor: copied ? AUTH.success : hovered ? AUTH.blue : AUTH.border, backgroundColor: copied ? AUTH.successLight : hovered ? AUTH.blueLight : AUTH.bg, boxShadow: focused ? RING : undefined })}>
      {copied ? <Check size={16} color={AUTH.success} strokeWidth={2.25} /> : <Copy size={16} color={AUTH.muted} strokeWidth={1.75} />}
    </Pressable>
  );
}

function Row({ label, value, copyLabel, doneLabel }: { label: string; value: string; copyLabel: string; doneLabel: string }) {
  const type = useAuthType();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: AUTH.bg, borderRadius: 10, borderWidth: 1, borderColor: AUTH.border, paddingVertical: 10, paddingLeft: 14, paddingRight: 10 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={[{ color: AUTH.muted, fontSize: 12 }, type('medium')]}>{label}</Text>
        <Text selectable numberOfLines={1} style={[{ color: AUTH.navy, fontSize: 14 }, type('medium')]}>{value}</Text>
      </View>
      <CopyButton value={value} label={copyLabel} doneLabel={doneLabel} />
    </View>
  );
}

/**
 * Demo card for isolated demo deployments. login.tsx requires this module only when EXPO_PUBLIC_DEMO_LOGIN=true.
 * It fills the controlled form fields and never submits; signing in still goes through POST /api/auth/login.
 */
export function DemoAccountCard({ onFill, disabled }: { onFill: (email: string, password: string) => void; disabled?: boolean }) {
  const type = useAuthType();
  const { success } = useToast();
  const fill = () => { onFill(DEMO_ADMIN.email, DEMO_ADMIN.password); success('Demo credentials filled successfully.'); };
  return (
    <View style={{ backgroundColor: AUTH.surface, borderRadius: 16, borderWidth: 1, borderColor: AUTH.border, padding: 20, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: AUTH.blueLight }}><ShieldCheck size={18} color={AUTH.blue} strokeWidth={1.75} /></View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text accessibilityRole="header" style={[{ color: AUTH.navy, fontSize: 15 }, type('semi')]}>Demo Account</Text>
          <Text numberOfLines={1} style={[{ color: AUTH.muted, fontSize: 12 }, type()]}>Demonstration use only</Text>
        </View>
        <View style={{ backgroundColor: AUTH.blueLight, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={[{ color: AUTH.blue, fontSize: 11, letterSpacing: 0.4 }, type('semi')]}>DEMO</Text></View>
      </View>
      <Row label="Work Email" value={DEMO_ADMIN.email} copyLabel="Copy demo email" doneLabel="Demo email copied" />
      <Row label="Password" value={DEMO_ADMIN.password} copyLabel="Copy demo password" doneLabel="Demo password copied" />
      <Pressable onPress={fill} disabled={disabled} accessibilityRole="button" accessibilityLabel="Use Demo Account"
        style={({ hovered, pressed, focused }: PS) => ({ height: 48, borderRadius: 10, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: AUTH.blue,
          backgroundColor: hovered || pressed ? AUTH.bg : AUTH.blueLight, opacity: disabled ? 0.5 : 1, boxShadow: focused ? RING : hovered ? '0 4px 10px rgba(37,99,235,0.14)' : undefined })}>
        <Text style={[{ color: AUTH.blue, fontSize: 14 }, type('semi')]}>Use Demo Account</Text>
        <ArrowRight size={16} color={AUTH.blue} strokeWidth={2} />
      </Pressable>
    </View>
  );
}
