import { ShieldCheck, Shapes } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { api, errorMessage } from "../lib/api";

export function SetupPage() {
  const status = useQuery({ queryKey: ["setup-status"], queryFn: () => api<{ needsSetup: boolean }>("/setup/status") });
  const [done, setDone] = useState(false); const [error, setError] = useState(""); const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSubmitting(true); const data = new FormData(event.currentTarget);
    try {
      await api("/setup/bootstrap", { method: "POST", headers: { "X-Setup-Token": String(data.get("setupToken")) }, body: JSON.stringify({ companyName: String(data.get("companyName")), companySlug: String(data.get("companySlug")), displayName: String(data.get("displayName")), email: String(data.get("email")), password: String(data.get("password")) }) }, false);
      setDone(true);
    } catch (cause) { setError(errorMessage(cause)); } finally { setSubmitting(false); }
  }
  return <main className="auth-screen"><section className="auth-card auth-card-wide">
    <div className="auth-brand"><span className="brand-mark"><Shapes size={19} weight="fill" /></span><span><strong>PrettyLittle</strong><small>Manager</small></span></div>
    {done || status.data?.needsSetup === false ? <div className="setup-complete"><ShieldCheck size={36} weight="duotone" /><h1>Workspace ready</h1><p>The private Pretty Little Things workspace has an administrator. Initial setup is now permanently disabled.</p><Button asChild><Link to="/login">Continue to sign in</Link></Button></div> : <>
      <div className="auth-heading"><span><ShieldCheck size={15} /> One-time setup</span><h1>Create the private workspace</h1><p>This works only while the database has no company. Use the server-side token configured in <code>INITIAL_SETUP_TOKEN</code>.</p></div>
      <form className="form-stack auth-form" onSubmit={submit}>
        <div className="form-grid"><div className="field"><label htmlFor="companyName">Company</label><Input id="companyName" name="companyName" defaultValue="Pretty Little Things" required /></div><div className="field"><label htmlFor="companySlug">Workspace slug</label><Input id="companySlug" name="companySlug" defaultValue="aline" required /></div></div>
        <div className="field"><label htmlFor="displayName">Administrator name</label><Input id="displayName" name="displayName" required autoComplete="name" /></div>
        <div className="field"><label htmlFor="setupEmail">Administrator email</label><Input id="setupEmail" name="email" type="email" required autoComplete="email" /></div>
        <div className="field"><label htmlFor="setupPassword">Administrator password</label><Input id="setupPassword" name="password" type="password" minLength={12} required autoComplete="new-password" /><p className="field-help">At least 12 characters with uppercase, lowercase, and a number.</p></div>
        <div className="field"><label htmlFor="setupToken">One-time setup token</label><Input id="setupToken" name="setupToken" type="password" minLength={32} required autoComplete="off" /></div>
        {error && <p className="form-alert" role="alert">{error}</p>}<Button type="submit" disabled={submitting || status.isLoading}>{submitting ? "Creating workspace…" : "Create workspace"}</Button>
      </form></>}
  </section></main>;
}
