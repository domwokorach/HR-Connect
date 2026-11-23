import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Image } from 'expo-image';
import { useFonts } from 'expo-font';
import { useRef, useState, type ComponentProps, type ComponentRef, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { CalendarCheck, ChartColumn, Check, CircleAlert, CircleCheck, Clock, Users } from 'lucide-react-native';
import { EyeIcon, LockIcon, MailIcon } from './AuthIcons';
import type { AuthLayoutMode } from './layout';

/** Sign-in design tokens, from the HR Connect Figma file ("01 — Design Tokens"). */
export const AUTH = {
  navy: '#0F172A', navy2: '#1E293B', blue: '#2563EB', blueLight: '#EFF6FF', bg: '#FFFFFF', surface: '#F8FAFC',
  border: '#E2E8F0', muted: '#64748B', error: '#DC2626', errorLight: '#FEF2F2', success: '#16A34A', successLight: '#F0FDF4',
} as const;

const isWeb = Platform.OS === 'web';
const RING = '0 0 0 4px rgba(37,99,235,0.3)';
const RING_SOFT = '0 0 0 4px rgba(37,99,235,0.18)';
/** Web-only CSS transition so hover/focus changes ease in; native ignores it. */
const ease = (props: string): ViewStyle => (isWeb ? ({ transitionProperty: props, transitionDuration: '150ms', transitionTimingFunction: 'ease-out' } as ViewStyle) : {});

type PS = { hovered?: boolean; pressed: boolean; focused?: boolean };
export type Weight = 'regular' | 'medium' | 'semi' | 'bold';
const FAMILY: Record<Weight, string> = { regular: 'Inter_400Regular', medium: 'Inter_500Medium', semi: 'Inter_600SemiBold', bold: 'Inter_700Bold' };
const FALLBACK: Record<Weight, TextStyle['fontWeight']> = { regular: '400', medium: '500', semi: '600', bold: '700' };

/** Inter, loaded for the sign-in screen only; falls back to the platform font until (or if) it loads. */
export function useAuthType() {
  const [loaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  return (w: Weight = 'regular'): TextStyle => (loaded ? { fontFamily: FAMILY[w] } : { fontWeight: FALLBACK[w] });
}

/** Flat HR mark + HR Connect wordmark (Figma "HR Connect Logo"). */
export function BrandLockup({ theme }: { theme: 'light' | 'dark' }) {
  const type = useAuthType();
  const dark = theme === 'dark';
  return (
    <View accessible accessibilityLabel="HR Connect" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? AUTH.navy : '#FFFFFF' }}>
        <Text style={[{ color: dark ? '#FFFFFF' : AUTH.navy, fontSize: 18, letterSpacing: -0.36 }, type('bold')]}>HR</Text>
      </View>
      <Text style={[{ color: dark ? AUTH.navy : '#FFFFFF', fontSize: 24, letterSpacing: -0.48 }, type('semi')]}>HR Connect</Text>
    </View>
  );
}

const FEATURES = [
  { Icon: Users, title: 'Employee management', caption: 'Profiles, roles and records' },
  { Icon: Clock, title: 'Attendance tracking', caption: 'Clock-ins and timesheets' },
  { Icon: CalendarCheck, title: 'Leave management', caption: 'Requests and approvals' },
  { Icon: ChartColumn, title: 'Workforce analytics', caption: 'Headcount and trends' },
] as const;

/**
 * Photographic brand panel: local hero photo, navy gradient overlay, logo, headline and (split layout only) the four
 * product overlays. The photo is cropped per layout so the people stay in frame.
 */
export function HeroPanel({ mode, topInset = 0, roomy = true }: { mode: AuthLayoutMode; topInset?: number; roomy?: boolean }) {
  const type = useAuthType();
  const split = mode === 'split';
  const compact = mode === 'compact';
  const pad = split ? 56 : compact ? 24 : 56;
  const position = split ? { left: '50%', top: '40%' } : compact ? { left: '50%', top: '28%' } : { left: '50%', top: '22%' };
  const bottomPad = split ? 56 : compact ? 48 : 80; // stacked/compact leave room for the form sheet that overlaps the photo
  return (
    <View style={[{ backgroundColor: AUTH.navy, overflow: 'hidden', paddingHorizontal: split ? (roomy ? 64 : 48) : pad, paddingTop: pad - (split ? 0 : 8) + topInset, paddingBottom: bottomPad }, split ? { flex: 1 } : null, !split && !compact ? { minHeight: 368 + topInset } : null, compact ? { minHeight: 112 + topInset } : null]}>
      <Image source={require('@/assets/images/login-hero.jpg')} contentFit="cover" contentPosition={position as never} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <Svg pointerEvents="none" width="100%" height="100%" preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0 }}>
        <Defs>
          <LinearGradient id="heroFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={AUTH.navy} stopOpacity={compact ? 0.72 : 0.55} />
            <Stop offset="0.5" stopColor={AUTH.navy} stopOpacity={compact ? 0.72 : 0.58} />
            <Stop offset="1" stopColor={AUTH.navy} stopOpacity={compact ? 0.78 : 0.95} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#heroFade)" />
        <Rect width="100%" height="100%" fill={AUTH.blue} fillOpacity={0.16} />
      </Svg>
      <View style={{ flex: split ? 1 : undefined, justifyContent: 'space-between', gap: split ? 32 : 28, zIndex: 1 }}>
        <BrandLockup theme="light" />
        {compact ? null : (
          <View style={{ gap: split ? 32 : 10 }}>
            <View style={{ gap: split ? 16 : 10 }}>
              <Text style={[{ color: '#FFFFFF', fontSize: split ? (roomy ? 44 : 36) : 32, lineHeight: split ? (roomy ? 49 : 40) : 36, letterSpacing: split ? -1.1 : -0.8, maxWidth: 560 }, type('semi')]}>The calm, clear way to run your people operations.</Text>
              <Text style={[{ color: 'rgba(255,255,255,0.8)', fontSize: split ? 17 : 15, lineHeight: split ? 26 : 22, maxWidth: 560 }, type()]}>Bring your people, processes and insights together in one seamless HR workspace.</Text>
            </View>
            {split && roomy ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {FEATURES.map(({ Icon, title, caption }) => (
                  <View key={title} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingRight: 16, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' }}>
                    <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' }}><Icon size={18} color="#FFFFFF" strokeWidth={1.75} /></View>
                    <View style={{ flexShrink: 1, gap: 2 }}>
                      <Text numberOfLines={1} style={[{ color: '#FFFFFF', fontSize: 14 }, type('semi')]}>{title}</Text>
                      <Text numberOfLines={1} style={[{ color: 'rgba(255,255,255,0.72)', fontSize: 12 }, type()]}>{caption}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}

/** Rounded 48px field with leading icon and optional trailing control. Hover, focus ring, invalid and disabled states. */
function Field({ label, icon, error, disabled, trailing, ...input }: {
  label: string; icon: ReactNode; error?: boolean; disabled?: boolean; trailing?: ReactNode;
} & Omit<ComponentProps<typeof TextInput>, 'style' | 'editable'>) {
  const type = useAuthType();
  const [focus, setFocus] = useState(false);
  const [hover, setHover] = useState(false);
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  return (
    <View style={{ gap: 8 }}>
      <Text style={[{ color: AUTH.navy, fontSize: 14 }, type('medium')]}>{label}</Text>
      <Pressable onPress={() => ref.current?.focus()} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} disabled={disabled} accessible={false}
        style={[{ backgroundColor: disabled ? AUTH.surface : AUTH.bg, borderRadius: 10, paddingHorizontal: 16, height: 48, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: focus || error ? 1.5 : 1, opacity: disabled ? 0.6 : 1,
          borderColor: error ? AUTH.error : focus ? AUTH.blue : hover ? '#CBD5E1' : AUTH.border, boxShadow: focus ? (error ? '0 0 0 4px rgba(220,38,38,0.14)' : RING_SOFT) : undefined }, ease('border-color, box-shadow')]}>
        {icon}
        <TextInput ref={ref} accessibilityLabel={label} editable={!disabled} placeholderTextColor={AUTH.muted} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={[{ flex: 1, color: AUTH.navy, fontSize: 15, paddingVertical: 0, height: 46, minWidth: 0, outlineStyle: 'none' } as never, type()]} {...input} />
        {trailing}
      </Pressable>
    </View>
  );
}

type FieldProps = { value: string; onChangeText: (v: string) => void; error?: boolean; disabled?: boolean; onSubmitEditing?: () => void };
export const EmailField = (p: FieldProps) => (
  <Field label="Work Email" icon={<MailIcon size={18} color={p.error ? AUTH.error : AUTH.muted} />} placeholder="name@company.com" autoCapitalize="none" autoComplete="username" keyboardType="email-address" textContentType="username" returnKeyType="next" {...p} />
);

export function PasswordVisibilityToggle({ visible, onToggle, disabled }: { visible: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onToggle} disabled={disabled} hitSlop={12} accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'} accessibilityState={{ expanded: visible }}
      style={({ focused }: PS) => ({ borderRadius: 6, padding: 2, boxShadow: focused ? RING : undefined })}>
      <EyeIcon size={18} slashed={visible} />
    </Pressable>
  );
}

export function PasswordField(p: FieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label="Password" icon={<LockIcon size={18} color={p.error ? AUTH.error : AUTH.muted} />} placeholder="Enter your password" secureTextEntry={!visible} autoCapitalize="none" autoComplete="current-password" textContentType="password" returnKeyType="go"
      trailing={<PasswordVisibilityToggle visible={visible} onToggle={() => setVisible((v) => !v)} disabled={p.disabled} />} {...p} />
  );
}

export function FieldError({ children }: { children: ReactNode }) {
  const type = useAuthType();
  return <Text accessibilityRole="alert" style={[{ color: AUTH.error, fontSize: 13, marginTop: -12 }, type()]}>{children}</Text>;
}

/** Inline form feedback (Figma "Alert Message"). */
export function AuthAlert({ tone, children }: { tone: 'error' | 'success' | 'warning'; children: ReactNode }) {
  const type = useAuthType();
  const c = tone === 'error' ? { fg: AUTH.error, bg: AUTH.errorLight } : tone === 'success' ? { fg: AUTH.success, bg: AUTH.successLight } : { fg: '#B45309', bg: '#FFFBEB' };
  const Icon = tone === 'success' ? CircleCheck : CircleAlert;
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: c.fg, backgroundColor: c.bg }}>
      <Icon size={20} color={c.fg} strokeWidth={1.75} />
      <Text style={[{ color: c.fg, fontSize: 14, lineHeight: 20, flexShrink: 1 }, type('medium')]}>{children}</Text>
    </View>
  );
}

/** Remember me: a real checkbox (role, state, keyboard toggle, focus ring) with a 20px box. */
export function RememberMe({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const type = useAuthType();
  return (
    <Pressable onPress={() => onChange(!checked)} disabled={disabled} hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }} accessibilityRole="checkbox" accessibilityLabel="Remember me" accessibilityState={{ checked, disabled }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, opacity: disabled ? 0.6 : 1 }}>
      {({ focused }: PS) => (
        <>
          <View style={[{ width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: checked ? 0 : 1.5, borderColor: AUTH.border, backgroundColor: checked ? AUTH.blue : AUTH.bg, boxShadow: focused ? RING : undefined }, ease('background-color, box-shadow')]}>
            {checked ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
          </View>
          <Text style={[{ color: AUTH.muted, fontSize: 14 }, type('medium')]}>Remember me</Text>
        </>
      )}
    </Pressable>
  );
}

export function ForgotPasswordLink({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  const type = useAuthType();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }} accessibilityRole="link" accessibilityLabel="Forgot password"
      style={({ focused }: PS) => ({ borderRadius: 4, boxShadow: focused ? RING : undefined })}>
      {({ hovered }: PS) => <Text style={[{ color: AUTH.blue, fontSize: 14, textDecorationLine: hovered ? 'underline' : 'none' }, type('semi')]}>Forgot password?</Text>}
    </Pressable>
  );
}

export type SignInStatus = 'idle' | 'loading' | 'success';
/** 48px navy CTA. Blocks repeat presses while loading or after success, so a sign-in can't be submitted twice. */
export function SecureSignInButton({ status, onPress }: { status: SignInStatus; onPress: () => void }) {
  const type = useAuthType();
  const busy = status !== 'idle';
  return (
    <Pressable onPress={onPress} disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: busy, busy: status === 'loading' }} accessibilityLabel={status === 'loading' ? 'Signing in' : status === 'success' ? 'Signed in' : 'Sign in securely'}
      style={({ hovered, pressed, focused }: PS) => [{ height: 48, borderRadius: 10, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: hovered || pressed ? AUTH.navy2 : AUTH.navy, opacity: status === 'loading' ? 0.9 : 1,
        boxShadow: focused ? RING : hovered && !busy ? '0 8px 20px rgba(15,23,42,0.28)' : '0 2px 6px rgba(15,23,42,0.18)' }, ease('background-color, box-shadow')]}>
      {status === 'loading' ? <ActivityIndicator size="small" color="#FFFFFF" /> : status === 'success' ? <Check size={18} color="#FFFFFF" strokeWidth={2.5} /> : null}
      <Text style={[{ color: '#FFFFFF', fontSize: 15 }, type('semi')]}>{status === 'loading' ? 'Signing in…' : status === 'success' ? 'Signed in' : 'Sign in securely'}</Text>
    </Pressable>
  );
}

/** Heading block: "Welcome back" + supporting line. */
export function FormHeading({ compact }: { compact: boolean }) {
  const type = useAuthType();
  return (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={[{ color: AUTH.navy, fontSize: compact ? 30 : 34, lineHeight: compact ? 36 : 40, letterSpacing: -0.7 }, type('semi')]}>Welcome back</Text>
      <Text style={[{ color: AUTH.muted, fontSize: 15, lineHeight: 22 }, type()]}>Sign in to your HR Connect workspace.</Text>
    </View>
  );
}
