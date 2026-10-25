import { FormEvent, useEffect, useRef, useState } from 'react';
import { ApiError } from '../auth';
import GoogleButton from './GoogleButton';

export type AuthMode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';

interface Props {
  mode: AuthMode | null;
  onMode: (m: AuthMode) => void;
  onClose: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (name: string, email: string, password: string) => Promise<void>;
  onVerify: (email: string, otp: string) => Promise<void>;
  onResend: (email: string) => Promise<void>;
  onGoogle: (credential: string) => Promise<void>;
  onForgot: (email: string) => Promise<void>;
  onReset: (newPassword: string) => Promise<void>;
}

const TITLES: Record<AuthMode, string> = {
  login: 'Welcome back',
  register: 'Create your account',
  verify: 'Check your email',
  forgot: 'Forgot your password?',
  reset: 'Choose a new password',
};

const RESEND_SECONDS = 60;

export default function AuthDialog(p: Props) {
  const { mode, onMode, onClose } = p;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!mode) return;
    setError(null);
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, onClose]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (!mode) return null;

  const switchTo = (m: AuthMode, message: string | null = null) => {
    setError(null);
    setNotice(message);
    setPassword('');
    setConfirm('');
    setOtp('');
    onMode(m);
  };

  const fail = (err: unknown) => {
    if (err instanceof ApiError) setError(err.fieldErrors.length ? err.fieldErrors.join(' · ') : err.message);
    else setError('Cannot reach the server. Is the auth service running?');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'reset' && password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'register') {
        await p.onRegister(name.trim(), email.trim(), password);
        setCooldown(RESEND_SECONDS);
        switchTo('verify', `We've emailed a 6-digit code to ${email.trim()}.`);
      } else if (mode === 'verify') {
        await p.onVerify(email.trim(), otp.trim());
        setOtp('');
        onClose(); // verified and signed in
      } else if (mode === 'login') {
        try {
          await p.onLogin(email.trim(), password);
          onClose();
        } catch (err) {
          if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
            setCooldown(RESEND_SECONDS);
            switchTo('verify', `Please verify your email first. We've emailed a new code to ${email.trim()}.`);
          } else {
            throw err;
          }
        }
      } else if (mode === 'forgot') {
        await p.onForgot(email.trim());
        // Same message whether or not the account exists.
        setNotice(`If an account exists for ${email.trim()}, we've emailed a link to reset the password. It's valid for 30 minutes.`);
      } else {
        await p.onReset(password);
        switchTo('login', 'Password updated. Sign in with your new password.');
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    try {
      await p.onResend(email.trim());
      setCooldown(RESEND_SECONDS);
      setNotice(`A new code is on its way to ${email.trim()}.`);
    } catch (err) {
      fail(err);
    }
  };

  const google = async (credential: string) => {
    setError(null);
    setBusy(true);
    try {
      await p.onGoogle(credential);
      onClose();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const newPassword = mode === 'register' || mode === 'reset';
  const showEmailSent = mode === 'forgot' && notice !== null;
  const submitLabel = { login: 'Sign in', register: 'Create account', verify: 'Verify email', forgot: 'Send reset link', reset: 'Update password' }[mode];

  return (
    <div className="modal-wrap" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <div className="scrim scrim-on" onClick={onClose} />
      <form className="modal" onSubmit={submit}>
        <button type="button" className="icon-btn modal-x" onClick={onClose} aria-label="Close">✕</button>
        <h2 id="auth-title">{TITLES[mode]}</h2>
        <p className="muted">
          {mode === 'register' && 'Takes a minute. We will email you a code to confirm your address.'}
          {mode === 'login' && 'Sign in to see your orders and cart.'}
          {mode === 'verify' && 'Enter the 6-digit code to finish setting up your account. It expires in 10 minutes.'}
          {mode === 'forgot' && "Enter your email and we'll send you a reset link."}
          {mode === 'reset' && "You can't reuse any of your last 3 passwords."}
        </p>

        {(mode === 'login' || mode === 'register') && <GoogleButton onCredential={google} text={mode === 'register' ? 'signup_with' : 'signin_with'} />}

        {notice && <p className="form-ok" role="status">{notice}</p>}

        {!showEmailSent && (
          <>
            {mode === 'register' && (
              <label className="field">
                Name
                <input ref={firstField} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={80} />
              </label>
            )}
            {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
              <label className="field">
                Email
                <input
                  ref={mode === 'register' ? undefined : firstField}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </label>
            )}
            {mode === 'verify' && (
              <label className="field">
                6-digit code
                <input
                  ref={firstField}
                  className="otp-input"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="······"
                  pattern="\d{6}"
                  required
                />
              </label>
            )}
            {(mode === 'login' || mode === 'register' || mode === 'reset') && (
              <label className="field">
                {mode === 'reset' ? 'New password' : 'Password'}
                <input
                  ref={mode === 'reset' ? firstField : undefined}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={newPassword ? 'new-password' : 'current-password'}
                  required
                  minLength={newPassword ? 8 : undefined}
                  maxLength={128}
                />
                {newPassword && <small className="muted">At least 8 characters.</small>}
              </label>
            )}
            {mode === 'reset' && (
              <label className="field">
                Confirm new password
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required minLength={8} maxLength={128} />
              </label>
            )}

            {error && <p className="form-error" role="alert">{error}</p>}

            <button className="btn btn-primary btn-block" disabled={busy || (mode === 'verify' && otp.length !== 6)}>
              {busy ? 'Please wait…' : submitLabel}
            </button>
          </>
        )}

        {mode === 'verify' && (
          <p className="switch">
            Didn't get it?{' '}
            {cooldown > 0 ? (
              <span>Resend in {cooldown}s</span>
            ) : (
              <button type="button" className="link" onClick={resend}>Resend code</button>
            )}
            <br />
            <button type="button" className="link" onClick={() => switchTo('register')}>Use a different email</button>
          </p>
        )}
        {mode === 'login' && (
          <p className="switch">
            <button type="button" className="link" onClick={() => switchTo('forgot')}>Forgot password?</button>
          </p>
        )}
        {(mode === 'login' || mode === 'register') && (
          <p className="switch">
            {mode === 'register' ? 'Already have an account?' : 'New here?'}{' '}
            <button type="button" className="link" onClick={() => switchTo(mode === 'register' ? 'login' : 'register')}>
              {mode === 'register' ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        )}
        {(mode === 'forgot' || mode === 'reset') && (
          <p className="switch">
            <button type="button" className="link" onClick={() => switchTo('login')}>Back to sign in</button>
          </p>
        )}
      </form>
    </div>
  );
}
