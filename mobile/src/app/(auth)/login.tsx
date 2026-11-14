import { Redirect, useRouter } from 'expo-router';
import { appFont } from '@/theme/typography';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandHeadline } from '@/components/brand/ColourfulText';
import { FeatureIcon, type FeatureIconName } from '@/components/brand/FeatureIcon';
import { LockKeyholeAnimated, ShieldCheckAnimated, ViewAnimated } from '@/components/brand/FormIcons';
import { Logo } from '@/components/brand/Logo';
import { BRAND } from '@/components/brand/logo-geometry';
import { Banner, Button, Row, T, useBreakpoint } from '@/components/ui';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';
import { useAppFont } from '@/lib/fonts';
import { ModeProvider } from '@/providers/mode-provider';
import { PaletteProvider } from '@/providers/palette-provider';
import { apiBaseUrl } from '@/services/config';

const FEATURES = [
  ['users', 'One home for your people', 'Profiles, schedules, leave and benefits in a single workspace.'],
  ['time', 'Time you can trust', 'Server-verified clock-ins, office or remote, with overtime approvals.'],
  ['insight', 'Insight at a glance', 'Live attendance, payroll and training analytics for every role.'],
  ['security', 'Secure by design', 'Role-based access, rotating sessions and a full audit trail.'],
] as const satisfies readonly (readonly [FeatureIconName, string, string])[];

function Feature({ icon, title, body }: { icon: FeatureIconName; title: string; body: string }) {
  const regular = useAppFont('400');
  const [hover, setHover] = useState(false);
  return (
    <Pressable onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)} style={{ cursor: 'default' } as never}>
      <Row align="flex-start" gap={14}>
        <View style={{ backgroundColor: hover ? '#2D4A75' : '#243B60', width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}><FeatureIcon name={icon} size={22} color="#F1F5F9" animate={hover} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[{ color: BRAND.white, fontSize: 15 }, regular]}>{title}</Text>
          <Text style={[{ color: '#B6BECD', fontSize: 13.5, lineHeight: 20 }, appFont('400')]}>{body}</Text>
        </View>
      </Row>
    </Pressable>
  );
}

/** Flat brand panel: Navy Dark surface, white/grey type, Navy Light icon tiles. No gradients, glow or blur. */
function BrandPanel() {
  return (
    <View style={{ flex: 1, backgroundColor: BRAND.navyDark, paddingHorizontal: 64, paddingVertical: 56, justifyContent: 'space-between' }}>
      <Logo variant="onDark" maxWidth={380} />
      <View style={{ gap: 32, maxWidth: 520 }}>
        <BrandHeadline tone="onDark" size={40} />
        <View style={{ gap: 18 }}>
          {FEATURES.map(([icon, title, body]) => <Feature key={title} icon={icon} title={title} body={body} />)}
        </View>
      </View>
      <Text style={[{ color: '#8791A6', fontSize: 12 }, appFont('400')]}>© HR Connect · Authorised use only</Text>
    </View>
  );
}

function LoginForm() {
  const { isWide, isTablet } = useBreakpoint();
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);
  const regular = useAppFont('400');

  const submit = async () => {
    if (busy) return;
    const errs: typeof fieldErr = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = 'Enter your work email address.';
    if (!password) errs.password = 'Enter your password.';
    setFieldErr(errs);
    if (Object.keys(errs).length) return;
    setBusy(true); setError(null);
    const err = await signIn(email, password, remember);
    setBusy(false);
    if (err) setError(err === 'Invalid email or password' ? 'Incorrect email or password.' : err);
  };

  return (
    <View style={{ width: '100%', maxWidth: 420, gap: 24 }}>
      {!isWide ? (
        <View style={{ alignItems: 'center', gap: 20 }}>
          <Logo variant="onLight" maxWidth={280} />
          <View style={{ maxWidth: 360 }}><BrandHeadline tone="onLight" size={isTablet ? 30 : 24} /></View>
        </View>
      ) : null}
      {/* simple card: white surface, 1px border, restrained shadow */}
      <View style={{ backgroundColor: BRAND.white, borderRadius: 16, borderWidth: 1, borderColor: '#CBD5E1', padding: 28, gap: 18, shadowColor: BRAND.navyDark, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
        <View style={{ gap: 4, alignItems: 'center' }}>
          <T v="h1" style={{ textAlign: 'center' }}>Welcome back</T>
          <T muted style={{ textAlign: 'center' }}>Sign in to your HR Connect workspace.</T>
        </View>
        <Input icon={ViewAnimated} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="username" keyboardType="email-address" placeholder="name@company.com" error={fieldErr.email} variant="outline" accessibilityLabel="Work email" />
        <Input icon={LockKeyholeAnimated} value={password} onChangeText={setPassword} secureTextEntry={!show} autoCapitalize="none" autoComplete="current-password" placeholder="Enter your password" onSubmitEditing={submit} error={fieldErr.password} variant="outline" accessibilityLabel="Password"
          rightComponent={<Pressable onPress={() => setShow(!show)} accessibilityRole="button" accessibilityLabel={show ? 'Hide password' : 'Show password'} hitSlop={10}><ViewAnimated size={18} color={show ? '#243B60' : '#475569'} /></Pressable>} />
        <Row style={{ justifyContent: 'space-between' }} wrap>
          <Checkbox checked={remember} onCheckedChange={setRemember} label="Remember this session" />
          <Pressable onPress={() => router.push('/forgot-password' as never)} accessibilityRole="link" accessibilityLabel="Forgot password"><Text style={[{ color: BRAND.navy, fontSize: 13 }, regular]}>Forgot password?</Text></Pressable>
        </Row>
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <Button title="Sign in securely" icon={<ShieldCheckAnimated size={18} color={BRAND.white} />} onPress={submit} loading={busy} style={{ backgroundColor: '#0B1730' }} />
      </View>
      <T v="small" muted style={{ textAlign: 'center' }}>Accounts are created by your HR administrator.{'\n'}Connected to {apiBaseUrl()}</T>
    </View>
  );
}

export default function Login() {
  const { user, loading } = useAuth();
  const { isWide, isTablet } = useBreakpoint();
  if (!loading && user) return <Redirect href="/" />;

  // The sign-in page keeps one fixed, flat brand look regardless of the user's saved theme.
  return (
    <PaletteProvider fixed="brand">
      <ModeProvider defaultMode="light">
        <SafeAreaView style={{ flex: 1, backgroundColor: BRAND.greyLight }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, flexDirection: 'row' }}>
            {isWide ? <BrandPanel /> : null}
            <ScrollView style={{ flex: isWide ? 0.85 : 1, backgroundColor: BRAND.greyLight }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: isTablet ? 40 : 20 }} keyboardShouldPersistTaps="handled">
              <LoginForm />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </ModeProvider>
    </PaletteProvider>
  );
}
