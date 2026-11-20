import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { AUTH, AuthCard, AuthenticationError, AuthFootnote, AuthLayout, BrandHeader, DemoCredentialsPanel, EmailField, PasswordField, ProductStatement, SecureSignInButton, useAuthType, type SignInStatus } from '@/components/auth/auth';
import { useBreakpoint } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { DEMO_LOGIN_ENABLED } from '@/lib/demo';
import { ModeProvider } from '@/providers/mode-provider';
import { PaletteProvider } from '@/providers/palette-provider';

function SignInCard() {
  const router = useRouter();
  const { signIn, sessionExpired } = useAuth();
  const type = useAuthType();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    const err = await signIn(email, password, true);
    if (err) { setStatus('idle'); setError(err === 'Invalid email or password' ? 'Invalid email or password. Please try again.' : err); }
    else setStatus('success'); // the redirect to the role's dashboard follows from the session
  };

  return (
    <AuthCard>
      <BrandHeader />
      <Text accessibilityRole="header" style={[{ color: AUTH.navy, fontSize: 28 }, type(true)]}>Welcome back</Text>
      <Text style={[{ color: AUTH.muted, fontSize: 13 }, type()]}>Sign in to your HR Connect workspace.</Text>
      <EmailField value={email} onChangeText={(v) => { setEmail(v); setFieldErr((f) => ({ ...f, email: undefined })); }} error={!!fieldErr.email || !!error} disabled={busy} onSubmitEditing={submit} />
      {fieldErr.email ? <AuthenticationError>{fieldErr.email}</AuthenticationError> : null}
      <PasswordField value={password} onChangeText={(v) => { setPassword(v); setFieldErr((f) => ({ ...f, password: undefined })); }} error={!!fieldErr.password || !!error} disabled={busy} onSubmitEditing={submit} />
      {fieldErr.password ? <AuthenticationError>{fieldErr.password}</AuthenticationError> : null}
      {sessionExpired && !error ? <Text accessibilityRole="alert" style={[{ color: '#B86B0C', fontSize: 12 }, type()]}>Your session expired. Please sign in again.</Text> : null}
      {error ? <AuthenticationError>{error}</AuthenticationError> : null}
      <Pressable onPress={() => router.push('/forgot-password' as never)} disabled={busy} accessibilityRole="link" accessibilityLabel="Forgot password" style={{ alignSelf: 'flex-start' }}>
        <Text style={[{ color: AUTH.blue, fontSize: 13 }, type(true)]}>Forgot password?</Text>
      </Pressable>
      {DEMO_LOGIN_ENABLED ? <DemoCredentialsPanel disabled={busy} onFill={(e, p) => { setEmail(e); setPassword(p); setFieldErr({}); setError(null); }} /> : null}
      <SecureSignInButton status={status} onPress={submit} />
      <AuthFootnote />
    </AuthCard>
  );
}

export default function Login() {
  const { user, loading } = useAuth();
  const { isWide, isTablet } = useBreakpoint();
  if (!loading && user) return <Redirect href="/" />;

  // The sign-in page keeps one fixed look regardless of the user's saved theme.
  return (
    <PaletteProvider fixed="brand">
      <ModeProvider defaultMode="light">
        <AuthLayout wide={isWide} tablet={isTablet} aside={<ProductStatement />}>
          <SignInCard />
        </AuthLayout>
      </ModeProvider>
    </PaletteProvider>
  );
}
