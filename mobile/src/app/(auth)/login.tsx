import { Redirect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AUTH, AuthAlert, EmailField, FieldError, ForgotPasswordLink, FormHeading, HeroPanel, PasswordField, RememberMe, SecureSignInButton, useAuthType, type SignInStatus } from '@/components/auth/auth';
import { FORM_MAX_WIDTH, HERO_SHARE, authLayoutMode } from '@/components/auth/layout';
import { useAuth } from '@/lib/auth';
import { ModeProvider } from '@/providers/mode-provider';
import { PaletteProvider } from '@/providers/palette-provider';

/**
 * Demo card: required only when EXPO_PUBLIC_DEMO_LOGIN=true. Expo inlines that variable at build time, so in a normal
 * build the condition is the constant `false`, Metro drops the require and the credentials module goes with it.
 * Keep the comparison inline; hoisting it into a shared constant defeats the dead-code elimination.
 */
const DemoAccountCard = process.env.EXPO_PUBLIC_DEMO_LOGIN === 'true'
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ? (require('@/components/auth/DemoAccountCard') as typeof import('@/components/auth/DemoAccountCard')).DemoAccountCard
  : null;

function SignInForm({ compact }: { compact: boolean }) {
  const router = useRouter();
  const { signIn, sessionExpired } = useAuth();
  const type = useAuthType();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [status, setStatus] = useState<SignInStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string }>({});
  const busy = status !== 'idle';

  const submit = async () => {
    if (busy) return;
    const errs: typeof fieldErr = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = 'Enter a valid work email address.';
    if (!password) errs.password = 'Enter your password.';
    setFieldErr(errs);
    if (Object.keys(errs).length) return;
    setStatus('loading'); setError(null);
    const err = await signIn(email, password, remember);
    if (err) { setStatus('idle'); setError(err === 'Invalid email or password' ? 'Incorrect email or password. Please try again.' : err); }
    else setStatus('success'); // the redirect to the role's dashboard follows from the session
  };

  return (
    <View style={{ width: '100%', maxWidth: FORM_MAX_WIDTH, gap: 24 }}>
      <FormHeading compact={compact} />
      {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
      {status === 'success' ? <AuthAlert tone="success">Signed in. Redirecting to your dashboard…</AuthAlert> : null}
      {sessionExpired && !error && status === 'idle' ? <AuthAlert tone="warning">Your session expired. Please sign in again.</AuthAlert> : null}
      <View style={{ gap: 20 }}>
        <EmailField value={email} onChangeText={(v) => { setEmail(v); setFieldErr((f) => ({ ...f, email: undefined })); }} error={!!fieldErr.email || !!error} disabled={busy} onSubmitEditing={submit} />
        {fieldErr.email ? <FieldError>{fieldErr.email}</FieldError> : null}
        <PasswordField value={password} onChangeText={(v) => { setPassword(v); setFieldErr((f) => ({ ...f, password: undefined })); }} error={!!fieldErr.password || !!error} disabled={busy} onSubmitEditing={submit} />
        {fieldErr.password ? <FieldError>{fieldErr.password}</FieldError> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 16, rowGap: 8 }}>
          <RememberMe checked={remember} onChange={setRemember} disabled={busy} />
          <ForgotPasswordLink onPress={() => router.push('/forgot-password' as never)} disabled={busy} />
        </View>
      </View>
      {DemoAccountCard ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={{ flex: 1, height: 1, backgroundColor: AUTH.border }} />
            <Text style={[{ color: AUTH.muted, fontSize: 12 }, type('medium')]}>Demo environment</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: AUTH.border }} />
          </View>
          <DemoAccountCard disabled={busy} onFill={(e, p) => { setEmail(e); setPassword(p); setFieldErr({}); setError(null); }} />
        </>
      ) : null}
      <SecureSignInButton status={status} onPress={submit} />
    </View>
  );
}

function LoginLayout() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const mode = authLayoutMode(width);

  if (mode === 'split') {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: AUTH.bg }}>
        <View style={{ width: `${HERO_SHARE * 100}%`, flexShrink: 0 }}><HeroPanel mode="split" roomy={width >= 1200} /></View>
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingVertical: 48 }}>
          <SignInForm compact={false} />
        </ScrollView>
      </View>
    );
  }

  // Tablet and mobile: photo header with the form sheet overlapping its bottom edge.
  const compact = mode === 'compact';
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: AUTH.navy }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        <HeroPanel mode={mode} topInset={insets.top} />
        <View style={{ flexGrow: 1, marginTop: compact ? -24 : -28, backgroundColor: AUTH.bg, borderTopLeftRadius: compact ? 24 : 28, borderTopRightRadius: compact ? 24 : 28, alignItems: 'center', paddingHorizontal: compact ? 24 : 64, paddingTop: compact ? 28 : 40, paddingBottom: 24 + insets.bottom }}>
          <SignInForm compact={compact} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function Login() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Redirect href="/" />;

  // The sign-in page keeps one fixed look regardless of the user's saved theme.
  return (
    <PaletteProvider fixed="brand">
      <ModeProvider defaultMode="light">
        <LoginLayout />
      </ModeProvider>
    </PaletteProvider>
  );
}
