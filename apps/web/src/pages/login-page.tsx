import { LockKey, Shapes } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { errorMessage } from "../lib/api";

export function LoginPage() {
  const auth = useAuth(); const navigate = useNavigate(); const location = useLocation();
  const [error, setError] = useState(""); const [submitting, setSubmitting] = useState(false);
  if (!auth.loading && auth.profile) return <Navigate to="/" replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSubmitting(true);
    const data = new FormData(event.currentTarget);
    try { await auth.login({ email: String(data.get("email")), password: String(data.get("password")), workspace: String(data.get("workspace") || "aline") }); navigate((location.state as { from?: string } | null)?.from ?? "/", { replace: true }); }
    catch (cause) { setError(errorMessage(cause)); } finally { setSubmitting(false); }
  }
  return <main className="auth-screen"><section className="auth-card">
    <div className="auth-brand"><span className="brand-mark"><Shapes size={19} weight="fill" /></span><span><strong>PrettyLittle</strong><small>Manager</small></span></div>
    <div className="auth-heading"><span><LockKey size={15} /> Private · invitation only</span><h1>Sign in to Pretty Little Things</h1><p>Use the account created during setup or an invitation issued by an administrator.</p></div>
    <form className="form-stack auth-form" onSubmit={submit}>
      <div className="field"><label htmlFor="workspace">Workspace</label><Input id="workspace" name="workspace" defaultValue="aline" autoComplete="organization" /></div>
      <div className="field"><label htmlFor="email">Email</label><Input id="email" name="email" type="email" required autoComplete="email" /></div>
      <div className="field"><label htmlFor="password">Password</label><Input id="password" name="password" type="password" required autoComplete="current-password" /></div>
      {error && <p className="form-alert" role="alert">{error}</p>}
      <Button type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</Button>
    </form>
    <p className="auth-footnote">First installation? <Link to="/setup">Create the private workspace</Link></p>
  </section></main>;
}
