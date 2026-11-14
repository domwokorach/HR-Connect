import { useRouter } from 'expo-router';
import { useState } from 'react';
import { AuthShell } from '@/components/brand/AuthShell';
import { Banner, Button, Field, T } from '@/components/ui';
import { errorMessage, post } from '@/services/api';

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('Enter your work email.');
    setBusy(true); setErr(null);
    try { await post('/auth/forgot-password', { email: email.trim() }); setDone(true); } catch (e) { setErr(errorMessage(e)); }
    setBusy(false);
  };
  return (
    <AuthShell>
            <T v="h2">Reset your password</T>
            {done ? <Banner tone="success">If that email is registered, a reset link has been sent. It expires in 30 minutes.</Banner> : (
              <>
                <T muted>Enter your work email and we&apos;ll send you a reset link.</T>
                <Field label="Work email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
                {err ? <Banner tone="danger">{err}</Banner> : null}
                <Button title="Send reset link" onPress={submit} loading={busy} />
              </>
            )}
            <Button variant="ghost" title="Back to sign in" onPress={() => router.replace('/login' as never)} />
          </AuthShell>
  );
}
