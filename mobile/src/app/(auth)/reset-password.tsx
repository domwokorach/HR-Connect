import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { AuthShell } from '@/components/brand/AuthShell';
import { Banner, Button, Field, T } from '@/components/ui';
import { errorMessage, post } from '@/services/api';

export default function ResetPassword() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const [token, setToken] = useState(params.token ?? '');
  const [pw, setPw] = useState('');
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr(null);
    try { await post('/auth/reset-password', { token: token.trim(), password: pw }); setDone(true); } catch (e) { setErr(errorMessage(e)); }
    setBusy(false);
  };
  return (
    <AuthShell>
            <T v="h2">Choose a new password</T>
            {done ? <Banner tone="success">Password updated. You can sign in now.</Banner> : (
              <>
                {!params.token ? <Field label="Reset token" value={token} onChangeText={setToken} autoCapitalize="none" /> : null}
                <Field label="New password" value={pw} onChangeText={setPw} secureTextEntry autoCapitalize="none" hint="10+ characters with upper, lower and a digit" />
                {err ? <Banner tone="danger">{err}</Banner> : null}
                <Button title="Update password" onPress={submit} loading={busy} disabled={pw.length < 10 || token.length < 20} />
              </>
            )}
            <Button variant="ghost" title="Back to sign in" onPress={() => router.replace('/login' as never)} />
          </AuthShell>
  );
}
