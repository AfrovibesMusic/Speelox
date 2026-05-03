import React, { useState } from "react";
import { Sparkles, Mail, Lock, Loader2, Chrome, ArrowRight, UserPlus, LogIn, AtSign } from "lucide-react";
import { loginWithGoogle, loginWithEmail, signupWithEmail, claimUsername, isUsernameAvailable } from "../services/firebase";
import { cn } from "../lib/utils";

export function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate username if signing up
    if (!isLogin) {
      if (username.length < 3) {
        setError("Username must be at least 3 characters");
        setLoading(false);
        return;
      }
      const available = await isUsernameAvailable(username);
      if (!available) {
        setError("Username is already taken");
        setLoading(false);
        return;
      }
    }

    try {
      if (isLogin) {
        await loginWithEmail(email, password);
      } else {
        const user = await signupWithEmail(email, password);
        if (user) {
          await claimUsername(user.uid, username);
        }
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handeGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setError(err.message || "Google login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans flex items-center justify-center p-6 relative overflow-hidden">
      {/* Dynamic Background Accents */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-0 overflow-hidden opacity-40">
        <div className="absolute top-[10%] right-[5%] w-[40rem] h-[40rem] bg-indigo-50 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[20%] left-[10%] w-[30rem] h-[30rem] bg-slate-100 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-12">
          <div className="w-16 h-16 bg-white flex items-center justify-center shadow-2xl shadow-slate-200 mx-auto mb-6 transform -rotate-6 overflow-hidden rounded-2xl p-3">
            <img src="https://i.postimg.cc/MpZpRwBd/speelox-logo.png" className="w-full h-full object-contain" alt="Speelox" />
          </div>
          <h1 className="text-4xl font-black font-display uppercase tracking-tighter text-slate-900 leading-none">Speelox</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 mt-2">Intelligence Studio</p>
        </div>

        <div className="glass-card rounded-[2.5rem] p-10 studio-shadow border border-white/50 space-y-8">
          <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
            <button 
              onClick={() => setIsLogin(true)}
              className={cn(
                "flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all rounded-xl flex items-center justify-center gap-2",
                isLogin ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-100" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <LogIn className="w-3.5 h-3.5" /> Login
            </button>
            <button 
              onClick={() => setIsLogin(false)}
              className={cn(
                "flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all rounded-xl flex items-center justify-center gap-2",
                !isLogin ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-100" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <UserPlus className="w-3.5 h-3.5" /> Join
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-4">
              {!isLogin && (
                <div className="relative">
                  <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input 
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="System Handle (Username)"
                    required={!isLogin}
                    minLength={3}
                    maxLength={20}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all"
                  />
                </div>
              )}
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input 
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email Address"
                  required
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all"
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input 
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Account Security Key"
                  required
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all"
                />
              </div>
            </div>

            {error && (
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-wide bg-red-50 p-3 rounded-lg border border-red-100 text-center">
                {error}
              </p>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full h-14 bg-slate-900 text-white text-[11px] font-black uppercase tracking-[0.3em] hover:bg-indigo-600 transition-all flex items-center justify-center gap-3 shadow-xl active:scale-95 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {isLogin ? "Terminate Lockdown" : "Initialize Access"}
            </button>
          </form>

          <div className="relative flex items-center gap-4">
            <div className="flex-1 h-[1px] bg-slate-100" />
            <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest whitespace-nowrap">Identity Providers</span>
            <div className="flex-1 h-[1px] bg-slate-100" />
          </div>

          <button 
            onClick={handeGoogleLogin}
            disabled={loading}
            className="w-full h-14 bg-white border border-slate-200 text-slate-600 text-[11px] font-black uppercase tracking-[0.3em] hover:bg-slate-50 transition-all flex items-center justify-center gap-3 shadow-sm active:scale-95 disabled:opacity-50"
          >
            <Chrome className="w-4 h-4" /> Google Auth
          </button>
        </div>

        <p className="mt-8 text-center text-[9px] font-black uppercase tracking-widest text-slate-400">
          Powered by Semantic Content Engine v.04
        </p>
      </div>
    </div>
  );
}
