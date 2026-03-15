import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Phone, Lock, User, ShieldCheck, RefreshCw, LogIn, UserPlus, LogOut, CheckCircle2, AlertCircle } from 'lucide-react';
import confetti from 'canvas-confetti';

// --- Types ---
type AuthMode = 'login' | 'register' | 'forgot-password' | 'reset-password';

interface UserData {
  id: number;
  email: string;
  mobile?: string;
  confirmed?: boolean;
}

// --- Components ---

const Input = ({ icon: Icon, label, ...props }: any) => (
  <div className="space-y-1.5">
    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider ml-1">
      {label}
    </label>
    <div className="relative group">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-zinc-900 transition-colors">
        <Icon size={18} />
      </div>
      <input
        {...props}
        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-3 pl-10 pr-4 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 transition-all"
      />
    </div>
  </div>
);

const Button = ({ children, loading, variant = 'primary', ...props }: any) => {
  const variants = {
    primary: 'bg-zinc-900 text-white hover:bg-zinc-800',
    secondary: 'bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50',
  };

  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 ${variants[variant as keyof typeof variants]}`}
    >
      {loading ? <RefreshCw className="animate-spin" size={20} /> : children}
    </button>
  );
};

const API_URL = '';

export default function App() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form State
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaQuestion, setCaptchaQuestion] = useState('');
  const [captchaId, setCaptchaId] = useState('');

  // Generate Captcha
  const generateCaptcha = async () => {
    try {
      const res = await fetch('/api/auth/captcha');
      const data = await res.json();
      setCaptchaQuestion(data.question);
      setCaptchaId(data.captchaId);
      setCaptchaInput('');
    } catch (err) {
      console.error('Failed to generate captcha', err);
    }
  };

  useEffect(() => {
    generateCaptcha();

    // Check for reset code in URL
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
      setResetCode(code);
      setMode('reset-password');
    }

    // Check for existing token
    const token = localStorage.getItem('token');
    if (token) {
      fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data.user) setUser(data.user);
        else localStorage.removeItem('token');
      })
      .catch(() => localStorage.removeItem('token'));
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (mode === 'register') {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            email, 
            mobile,
            password,
            captchaId,
            captchaAnswer: parseInt(captchaInput)
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Registration failed');
        
        setSuccess('Registration successful! You can now login.');
        setMode('login');
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
      } else if (mode === 'forgot-password') {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to send reset email');
        }
        setSuccess('Password reset link sent to your email.');
      } else if (mode === 'reset-password') {
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match');
        }
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            code: resetCode,
            password
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Reset failed');
        
        setSuccess('Password reset successful! You can now login.');
        setMode('login');
        // Clear URL params
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: email || mobile, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');

        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setUser(data.user);
        confetti({
          particleCount: 150,
          spread: 100,
          origin: { y: 0.6 }
        });
      }
    } catch (err: any) {
      setError(err.message);
      generateCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setSuccess('Logged out successfully');
  };

  const handleResendVerification = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/auth/send-email-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user?.email }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to resend confirmation');
      }
      setSuccess('Verification email resent.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (user) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white rounded-[32px] p-10 shadow-sm border border-zinc-100 text-center space-y-8"
        >
          <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <ShieldCheck size={40} />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Welcome Back</h1>
            <p className="text-zinc-500">You are securely authenticated with EasyAuth</p>
          </div>

          <div className="bg-zinc-50 rounded-2xl p-6 text-left space-y-4 border border-zinc-100">
            {!user.confirmed && (
              <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 text-amber-700 text-xs font-medium">
                  <AlertCircle size={14} />
                  Email not verified
                </div>
                <button 
                  onClick={handleResendVerification}
                  disabled={loading}
                  className="text-[10px] font-bold text-amber-800 uppercase tracking-widest hover:underline disabled:opacity-50"
                >
                  Resend
                </button>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-zinc-100">
                <Mail size={18} className="text-zinc-600" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Email Address</p>
                <p className="text-zinc-900 font-medium">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-zinc-100">
                <Phone size={18} className="text-zinc-600" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Mobile Number</p>
                <p className="text-zinc-900 font-medium">{user.mobile}</p>
              </div>
            </div>
          </div>

          <Button variant="secondary" onClick={handleLogout}>
            <LogOut size={18} />
            Sign Out
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center p-6 font-sans">
      <motion.div 
        layout
        className="w-full max-w-md bg-white rounded-[32px] p-10 shadow-sm border border-zinc-100 space-y-8"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-zinc-900 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-zinc-900/20">
            <ShieldCheck size={28} />
          </div>
          <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">EasyAuth</h2>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">
            {mode === 'login' && 'Sign In'}
            {mode === 'register' && 'Create Account'}
            {mode === 'forgot-password' && 'Reset Password'}
            {mode === 'reset-password' && 'Set New Password'}
          </h1>
          <p className="text-zinc-500 text-sm">
            {mode === 'login' && 'Enter your credentials to access your Shopify store.'}
            {mode === 'register' && 'Join EasyAuth for a secure Shopify experience.'}
            {mode === 'forgot-password' && 'Enter your email to receive a reset link.'}
            {mode === 'reset-password' && 'Enter your new password below.'}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-red-50 text-red-600 p-4 rounded-xl flex items-center gap-3 text-sm font-medium border border-red-100"
            >
              <AlertCircle size={18} />
              {error}
            </motion.div>
          )}
          {success && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-emerald-50 text-emerald-600 p-4 rounded-xl flex items-center gap-3 text-sm font-medium border border-emerald-100"
            >
              <CheckCircle2 size={18} />
              {success}
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            icon={Mail}
            label="Email Address"
            type="email"
            placeholder="name@company.com"
            required
            value={email}
            onChange={(e: any) => setEmail(e.target.value)}
          />

          {mode === 'register' && (
            <Input
              icon={Phone}
              label="Mobile Number"
              type="tel"
              placeholder="+1 (555) 000-0000"
              required
              value={mobile}
              onChange={(e: any) => setMobile(e.target.value)}
            />
          )}

          {(mode === 'login' || mode === 'register' || mode === 'reset-password') && (
            <Input
              icon={Lock}
              label={mode === 'reset-password' ? 'New Password' : 'Password'}
              type="password"
              placeholder="••••••••"
              required
              value={password}
              onChange={(e: any) => setPassword(e.target.value)}
            />
          )}

          {mode === 'reset-password' && (
            <Input
              icon={Lock}
              label="Confirm New Password"
              type="password"
              placeholder="••••••••"
              required
              value={confirmPassword}
              onChange={(e: any) => setConfirmPassword(e.target.value)}
            />
          )}

          {mode === 'login' && (
            <div className="flex justify-end px-1">
              <button 
                type="button"
                onClick={() => setMode('forgot-password')}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                Forgot Password?
              </button>
            </div>
          )}

          {mode === 'register' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider ml-1">
                Human Verification
              </label>
              <div className="flex gap-3">
                <div className="flex-1 bg-zinc-100 border border-zinc-200 rounded-xl py-3 px-4 flex items-center justify-center font-mono text-sm font-bold text-zinc-600 select-none">
                  {captchaQuestion}
                </div>
                <button 
                  type="button"
                  onClick={generateCaptcha}
                  className="w-12 h-12 bg-white border border-zinc-200 rounded-xl flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 transition-all"
                >
                  <RefreshCw size={18} />
                </button>
              </div>
              <input
                type="text"
                placeholder="Enter answer"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-3 px-4 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 transition-all text-center font-mono tracking-widest"
                required
                value={captchaInput}
                onChange={(e) => setCaptchaInput(e.target.value)}
              />
            </div>
          )}

          <Button loading={loading}>
            {mode === 'login' && <LogIn size={18} />}
            {mode === 'register' && <UserPlus size={18} />}
            {(mode === 'forgot-password' || mode === 'reset-password') && <RefreshCw size={18} />}
            {mode === 'login' && 'Sign In'}
            {mode === 'register' && 'Create Account'}
            {mode === 'forgot-password' && 'Send Reset Link'}
            {mode === 'reset-password' && 'Update Password'}
          </Button>
        </form>

        <div className="pt-4 border-t border-zinc-100 text-center">
          <button 
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
              setSuccess(null);
            }}
            className="text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            {mode === 'login' && "Don't have an account? Sign up"}
            {mode === 'register' && "Already have an account? Sign in"}
            {(mode === 'forgot-password' || mode === 'reset-password') && "Back to Sign In"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
