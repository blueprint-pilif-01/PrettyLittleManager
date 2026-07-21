import { ShieldCheck, Shapes } from "@phosphor-icons/react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { api, errorMessage } from "../lib/api";

export function AcceptInvitationPage() {
  const [token, setToken] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    const fromHash = window.location.hash.slice(1);
    if (fromHash) {
      setToken(decodeURIComponent(fromHash));
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSubmitting(true);
    const data = new FormData(event.currentTarget);
    try {
      await api("/auth/invitations/accept", { method: "POST", body: JSON.stringify({ token: String(data.get("token")), password: String(data.get("password")), displayName: String(data.get("displayName")) || undefined }) }, false);
      setDone(true);
    } catch (cause) { setError(errorMessage(cause)); } finally { setSubmitting(false); }
  }
  return <main className="auth-screen"><section className="auth-card">
    <div className="auth-brand"><span className="brand-mark"><Shapes size={19} weight="fill" /></span><span><strong>PrettyLittle</strong><small>Manager</small></span></div>
    {done ? <div className="setup-complete"><ShieldCheck size={36} weight="duotone" /><h1>Invitation accepted</h1><p>Your account is active and the invitation cannot be reused.</p><Button asChild><Link to="/login">Sign in to Pretty Little Things</Link></Button></div> : <><div className="auth-heading"><span><ShieldCheck size={15} /> Private workspace</span><h1>Accept your invitation</h1><p>Choose your password to activate the invited Pretty Little Things account.</p></div><form className="form-stack auth-form" onSubmit={submit}>
      <div className="field"><label htmlFor="invitationToken">Invitation token</label><Input id="invitationToken" name="token" value={token} onChange={(event) => setToken(event.target.value)} minLength={32} required autoComplete="off" /></div>
      <div className="field"><label htmlFor="inviteDisplayName">Display name (optional)</label><Input id="inviteDisplayName" name="displayName" autoComplete="name" /></div>
      <div className="field"><label htmlFor="invitePassword">New password</label><Input id="invitePassword" name="password" type="password" minLength={12} required autoComplete="new-password" /><p className="field-help">At least 12 characters with uppercase, lowercase, and a number.</p></div>
      {error && <p className="form-alert" role="alert">{error}</p>}<Button type="submit" disabled={submitting}>{submitting ? "Activating…" : "Activate account"}</Button>
    </form></>}
  </section></main>;
}
