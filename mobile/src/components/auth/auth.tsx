import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { useFonts } from 'expo-font';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View, type TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DEMO_ADMIN } from '@/lib/demo';
import { EyeIcon, LockIcon, MailIcon, ShieldIcon } from './AuthIcons';

/** Sign-in design tokens, from the HR Connect Figma file. */
export const AUTH = {
  navy: '#101F3A', blue: '#375CE7', bg: '#F3F6FB', card: '#FFFFFF', field: '#F8FAFD', muted: '#64748B', border: '#E2E8F0',
  demoBg: '#EDF3FF', demoBtn: '#E0E9FF', success: '#087F5B', error: '#B4233C',
} as const;

/** Inter, loaded for the sign-in screens only; falls back to the platform font until (or if) it loads. */
export function useAuthType() {
  const [loaded] = useFonts({ Inter_400Regular, Inter_600SemiBold });
  return (semi?: boolean): TextStyle => (loaded ? { fontFamily: semi ? 'Inter_600SemiBold' : 'Inter_400Regular' } : { fontWeight: semi ? '600' : '400' });
}

export function AuthLayout({ wide, tablet, aside, children }: { wide: boolean; tablet: boolean; aside?: ReactNode; children: ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: AUTH.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, alignItems: wide ? 'flex-start' : 'center', paddingHorizontal: wide ? 100 : 16, paddingTop: wide ? 110 : tablet ? 56 : 26, paddingBottom: 32 }}>
        <View style={{ flexDirection: 'row', gap: 65, width: '100%', maxWidth: wide ? undefined : 430, alignItems: 'flex-start' }}>
          {wide ? aside : null}
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function ProductStatement() {
  const type = useAuthType();
  return (
    <View style={{ width: 550, flexShrink: 1, padding: 25, gap: 28 }}>
      <Text accessibilityRole="header" style={[{ color: AUTH.navy, fontSize: 43, lineHeight: 52 }, type(true)]}>{'YOUR PEOPLE.\nYOUR PRIORITY.'}</Text>
      <Text style={[{ color: AUTH.muted, fontSize: 20 }, type()]}>The calm, clear way to run your people operations.</Text>
      <Text style={[{ color: AUTH.blue, fontSize: 14 }, type(true)]}>{'People  /  Time  /  Permissions  /  Insights'}</Text>
    </View>
  );
}

export function AuthCard({ children }: { children: ReactNode }) {
  return <View style={{ backgroundColor: AUTH.card, borderRadius: 16, padding: 24, gap: 16, width: '100%', maxWidth: 430, flexShrink: 1 }}>{children}</View>;
}

export function BrandHeader() {
  const type = useAuthType();
  return (
    <View accessibilityLabel="HR Connect" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ backgroundColor: AUTH.blue, borderRadius: 10, padding: 10 }}><Text style={[{ color: '#fff', fontSize: 16 }, type(true)]}>HR</Text></View>
      <Text style={[{ color: AUTH.navy, fontSize: 22 }, type(true)]}>HR Connect</Text>
    </View>
  );
}

/** Rounded field with leading icon and optional trailing control. Hover, focus, invalid and disabled states per the Figma field-state list. */
function Field({ label, icon, error, disabled, trailing, ...input }: {
  label: string; icon: ReactNode; error?: boolean; disabled?: boolean; trailing?: ReactNode;
} & Omit<React.ComponentProps<typeof TextInput>, 'style' | 'editable'>) {
  const type = useAuthType();
  const [focus, setFocus] = useState(false);
  const [hover, setHover] = useState(false);
  const ref = useRef<React.ComponentRef<typeof TextInput>>(null);
  return (
    <View style={{ gap: 8 }}>
      <Text style={[{ color: AUTH.navy, fontSize: 13 }, type(true)]}>{label}</Text>
      <Pressable onPress={() => ref.current?.focus()} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} disabled={disabled} accessible={false}
        style={{ backgroundColor: AUTH.field, borderRadius: 11, paddingHorizontal: 14, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, opacity: disabled ? 0.6 : 1,
          borderColor: error ? AUTH.error : focus ? AUTH.blue : hover ? '#CBD5E1' : 'transparent' }}>
        {icon}
        <TextInput ref={ref} accessibilityLabel={label} editable={!disabled} placeholderTextColor={AUTH.muted} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={[{ flex: 1, color: AUTH.navy, fontSize: 13, paddingVertical: 12, minWidth: 0, outlineStyle: 'none' } as never, type()]} {...input} />
        {trailing}
      </Pressable>
    </View>
  );
}

type FieldProps = { value: string; onChangeText: (v: string) => void; error?: boolean; disabled?: boolean; onSubmitEditing?: () => void };
export const EmailField = (p: FieldProps) => (
  <Field label="Work email" icon={<MailIcon />} placeholder="Enter your work email" autoCapitalize="none" autoComplete="username" keyboardType="email-address" textContentType="username" {...p} />
);

export function PasswordVisibilityToggle({ visible, onToggle, disabled }: { visible: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onToggle} disabled={disabled} hitSlop={10} accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'} accessibilityState={{ expanded: visible }}>
      <EyeIcon slashed={visible} />
    </Pressable>
  );
}

export function PasswordField(p: FieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label="Password" icon={<LockIcon />} placeholder="Enter your password" secureTextEntry={!visible} autoCapitalize="none" autoComplete="current-password" textContentType="password" returnKeyType="go"
      trailing={<PasswordVisibilityToggle visible={visible} onToggle={() => setVisible((v) => !v)} disabled={p.disabled} />} {...p} />
  );
}

export function AuthenticationError({ children }: { children: ReactNode }) {
  const type = useAuthType();
  return <Text accessibilityRole="alert" style={[{ color: AUTH.error, fontSize: 12, lineHeight: 17 }, type()]}>{children}</Text>;
}

/** Dev-only panel. Fills the form fields and nothing else; the user still presses "Sign in securely". */
export function DemoCredentialsPanel({ onFill, disabled }: { onFill: (email: string, password: string) => void; disabled?: boolean }) {
  const type = useAuthType();
  const [filled, setFilled] = useState(false);
  const reduce = useReducedMotion();
  const pulse = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  useEffect(() => { if (!filled) return; const t = setTimeout(() => setFilled(false), 2200); return () => clearTimeout(t); }, [filled]);
  const fill = () => {
    onFill(DEMO_ADMIN.email, DEMO_ADMIN.password);
    setFilled(true);
    if (!reduce) pulse.set(withSequence(withTiming(1.02, { duration: 120 }), withTiming(1, { duration: 160 })));
  };
  return (
    <Animated.View style={[{ backgroundColor: AUTH.demoBg, borderRadius: 16, padding: 14, gap: 9 }, style]}>
      <Text style={[{ color: AUTH.blue, fontSize: 11 }, type(true)]}>DEMO ACCOUNT · DEVELOPMENT ONLY</Text>
      <Text selectable style={[{ color: AUTH.navy, fontSize: 13 }, type(true)]}>{DEMO_ADMIN.email}</Text>
      <Text selectable style={[{ color: AUTH.muted, fontSize: 12 }, type()]}>Password: {DEMO_ADMIN.password}</Text>
      <Pressable onPress={fill} disabled={disabled} accessibilityRole="button" style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({ backgroundColor: hovered || pressed ? '#D3E0FF' : AUTH.demoBtn, borderRadius: 11, paddingVertical: 15, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: disabled ? 0.6 : 1 })}>
        {filled ? <Check size={16} color={AUTH.success} /> : null}
        <Text style={[{ color: filled ? AUTH.success : AUTH.blue, fontSize: 14 }, type(true)]}>{filled ? 'Credentials filled' : 'Use demo credentials'}</Text>
      </Pressable>
    </Animated.View>
  );
}

export type SignInStatus = 'idle' | 'loading' | 'success';
/** Blocks repeat presses while loading or after success, so a sign-in can't be submitted twice. */
export function SecureSignInButton({ status, onPress }: { status: SignInStatus; onPress: () => void }) {
  const type = useAuthType();
  const busy = status !== 'idle';
  return (
    <Pressable onPress={onPress} disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: busy, busy: status === 'loading' }} accessibilityLabel={status === 'loading' ? 'Signing in' : status === 'success' ? 'Signed in' : 'Sign in securely'}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({ backgroundColor: status === 'success' ? AUTH.success : hovered || pressed ? '#2D50D0' : AUTH.blue, borderRadius: 11, paddingVertical: 15, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, opacity: status === 'loading' ? 0.85 : 1 })}>
      {status === 'loading' ? <ActivityIndicator size="small" color="#fff" /> : status === 'success' ? <Check size={20} color="#fff" /> : <ShieldIcon color="#fff" />}
      <Text style={[{ color: '#fff', fontSize: 14 }, type(true)]}>{status === 'loading' ? 'Signing in…' : status === 'success' ? 'Signed in' : 'Sign in securely'}</Text>
    </Pressable>
  );
}

export function AuthFootnote() {
  const type = useAuthType();
  return <Text style={[{ color: AUTH.muted, fontSize: 11 }, type()]}>Secure, role-based workspace access</Text>;
}
