"use client";

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
type NavPage = "sales" | "analytics" | "reports" | "integrations" | "profile" | "settings";
type AppState = "idle" | "loading" | "success" | "error";

interface MetricsSummary {
  total_revenue: number;
  total_units_sold: number;
  top_product_category: string;
  top_region: string;
  date_range: string;
}
interface ApiResponse {
  success: boolean;
  message: string;
  metrics_summary: MetricsSummary;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

function fmt$(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

const PIPELINE_STEPS = [
  { icon: "📁", label: "Data Ingestion",  desc: "Parse CSV / XLSX" },
  { icon: "🧮", label: "KPI Analysis",    desc: "Revenue, Units, Regions" },
  { icon: "🤖", label: "AI Narrative",    desc: "Gemini 1.5 Flash" },
  { icon: "📧", label: "Email Delivery",  desc: "HTML Report Sent" },
];

// ── NAV CONFIG ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    group: "PLATFORM",
    items: [
      { id: "sales" as NavPage, label: "Sales Insights", icon: <ChartIcon /> },
      { id: "analytics" as NavPage, label: "Analytics", icon: <PulseIcon /> },
      { id: "reports" as NavPage, label: "Reports", icon: <DocIcon /> },
      { id: "integrations" as NavPage, label: "Integrations", icon: <LinkIcon /> },
    ],
  },
  {
    group: "ACCOUNT",
    items: [
      { id: "profile" as NavPage, label: "Profile", icon: <UserIcon /> },
      { id: "settings" as NavPage, label: "Settings", icon: <GearIcon /> },
    ],
  },
];

// ════════════════════════════════════════════════════════════════════════════════
export default function Home() {
  const [page, setPage] = useState<NavPage>("sales");

  return (
    <div className="shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sb-logo">
          <div className="sb-logo-icon"><LayersIcon /></div>
          <span className="sb-logo-text">Rabbitt AI</span>
        </div>

        <nav className="sb-nav">
          {NAV_ITEMS.map((group) => (
            <div key={group.group} className="sb-group">
              <div className="sb-group-label">{group.group}</div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className={`sb-item ${page === item.id ? "sb-item--active" : ""}`}
                  onClick={() => setPage(item.id)}
                >
                  <span className="sb-item-icon">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sb-footer">
          <div className="sb-plan">
            <div className="sb-plan-avatar">RA</div>
            <div>
              <div className="sb-plan-name">Team Plan</div>
              <div className="sb-plan-sub">Unlimited reports</div>
            </div>
            <span className="sb-plan-badge">PRO</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="main">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-title">
            {NAV_ITEMS.flatMap((g) => g.items).find((i) => i.id === page)?.label || "Dashboard"}
          </div>
          <div className="topbar-right">
            <div className="topbar-kv"><span className="topbar-v">2.4s</span><span className="topbar-k">Avg Analysis</span></div>
            <div className="topbar-sep" />
            <div className="topbar-kv"><span className="topbar-v">99.8%</span><span className="topbar-k">Uptime</span></div>
            <div className="topbar-sep" />
            <div className="topbar-avatar">RA</div>
          </div>
        </header>

        {/* Page Content */}
        <div className="content">
          {page === "sales"        && <SalesPage />}
          {page === "analytics"    && <AnalyticsPage />}
          {page === "reports"      && <ReportsPage />}
          {page === "integrations" && <IntegrationsPage />}
          {page === "profile"      && <ProfilePage />}
          {page === "settings"     && <SettingsPage />}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SALES PAGE
// ══════════════════════════════════════════════════════════════════════════════
function SalesPage() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [file, setFile]         = useState<File | null>(null);
  const [email, setEmail]       = useState("");
  const [isDrag, setIsDrag]     = useState(false);
  const [errMsg, setErrMsg]     = useState("");
  const [resp, setResp]         = useState<ApiResponse | null>(null);
  const [progress, setProgress] = useState(0);
  const [activeStep, setStep]   = useState(-1);
  const fileRef    = useRef<HTMLInputElement>(null);
  const progRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const validFile = (f: File) => /\.(csv|xlsx?)/i.test(f.name);

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setIsDrag(false);
    const f = e.dataTransfer.files[0];
    if (f && validFile(f)) { setFile(f); setErrMsg(""); }
    else setErrMsg("Only .csv and .xlsx files accepted.");
  }, []);

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && validFile(f)) { setFile(f); setErrMsg(""); }
    else if (f) setErrMsg("Only .csv and .xlsx files accepted.");
  };

  const startAnim = () => {
    setProgress(0); setStep(0);
    let p = 0;
    progRef.current = setInterval(() => {
      p += Math.random() * 7;
      if (p >= 90) { clearInterval(progRef.current!); p = 90; }
      setProgress(Math.min(p, 90));
    }, 350);
    let s = 0;
    stepRef.current = setInterval(() => {
      s++; if (s >= 4) { clearInterval(stepRef.current!); return; }
      setStep(s);
    }, 2000);
  };

  const handleSubmit = async () => {
    if (!file) { setErrMsg("Please select a file."); return; }
    if (!email.includes("@") || !email.split("@")[1]?.includes(".")) {
      setErrMsg("Enter a valid email address."); return;
    }
    setAppState("loading"); setErrMsg(""); setResp(null);
    startAnim();
    const fd = new FormData();
    fd.append("file", file);
    fd.append("recipient_email", email);
    try {
      const res = await fetch(`${BACKEND_URL}/upload`, { method: "POST", body: fd });
      clearInterval(progRef.current!); clearInterval(stepRef.current!);
      setProgress(100); setStep(3);
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || `Error ${res.status}`); }
      const data: ApiResponse = await res.json();
      await new Promise((r) => setTimeout(r, 500));
      setResp(data); setAppState("success");
    } catch (err: unknown) {
      clearInterval(progRef.current!); clearInterval(stepRef.current!);
      setProgress(0); setStep(-1);
      setErrMsg(err instanceof Error ? err.message : "Unexpected error.");
      setAppState("error");
    }
  };

  const reset = () => {
    setAppState("idle"); setFile(null); setEmail(""); setErrMsg("");
    setResp(null); setProgress(0); setStep(-1);
    if (fileRef.current) fileRef.current.value = "";
  };

  if (appState === "success" && resp) return <SuccessView resp={resp} email={email} onReset={reset} />;

  return (
    <div className="sales-grid">
      {/* Upload Card */}
      <div className="card upload-card">
        <div className="card-head">
          <h2 className="card-title">Upload Sales Data</h2>
          <p className="card-sub">CSV or XLSX · Max 10 MB · Schema enforced</p>
        </div>

        {/* Drop Zone */}
        <div
          className={`dropzone ${isDrag ? "dropzone--drag" : ""} ${file ? "dropzone--file" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setIsDrag(true); }}
          onDragLeave={() => setIsDrag(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={onFileChange} />
          {file ? (
            <div className="dz-file">
              <div className="dz-fileicon"><FileIcon /></div>
              <div>
                <div className="dz-filename">{file.name}</div>
                <div className="dz-filesize">{(file.size / 1024).toFixed(1)} KB · click to replace</div>
              </div>
              <div className="dz-check">✓</div>
            </div>
          ) : (
            <div className="dz-placeholder">
              <div className="dz-uploadicon"><UploadIcon /></div>
              <div className="dz-text">
                <span className="dz-main">Drop your file here</span>
                <span className="dz-sub">or <span className="link">browse files</span></span>
              </div>
              <div className="dz-formats">
                <span className="fmt-tag">CSV</span>
                <span className="fmt-tag">XLSX</span>
                <span className="fmt-tag">XLS</span>
              </div>
            </div>
          )}
        </div>

        {/* Email */}
        <div className="field">
          <label className="field-label">Recipient Email</label>
          <div className="field-wrap">
            <span className="field-ico"><EmailIcon /></span>
            <input
              type="email" value={email} placeholder="executive@company.com"
              disabled={appState === "loading"}
              className="field-input"
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        {/* Error */}
        {(errMsg || appState === "error") && (
          <div className="err-banner">⚠ {errMsg || "Something went wrong."}</div>
        )}

        {/* Progress */}
        {appState === "loading" && (
          <div className="progress-block">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="progress-pct">{Math.round(progress)}%</span>
          </div>
        )}

        <button
          className={`submit-btn ${appState === "loading" ? "btn--loading" : ""}`}
          onClick={appState === "error" ? reset : handleSubmit}
          disabled={appState === "loading"}
        >
          {appState === "loading" ? "Analyzing & Sending…" : appState === "error" ? "↩ Try Again" : "✦ Generate & Send Report"}
        </button>
        <p className="submit-note">TLS Secured · Rate Limited · CORS Protected</p>
      </div>

      {/* Right Panel */}
      <div className="right-col">
        {/* Pipeline */}
        <div className="card">
          <div className="card-section-label">AI Processing Pipeline</div>
          <div className="pipeline">
            {PIPELINE_STEPS.map((step, i) => {
              const done   = appState === "success" || (appState === "loading" && activeStep > i);
              const active = appState === "loading" && activeStep === i;
              return (
                <div key={i} className="pipe-step">
                  <div className={`pipe-dot ${done ? "pipe-dot--done" : active ? "pipe-dot--active" : ""}`}>
                    {done ? "✓" : active ? <SmallSpinner /> : i + 1}
                  </div>
                  {i < 3 && <div className={`pipe-line ${done ? "pipe-line--done" : ""}`} />}
                  <div className="pipe-info">
                    <div className={`pipe-label ${done || active ? "pipe-label--lit" : ""}`}>{step.icon} {step.label}</div>
                    <div className="pipe-desc">{step.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Schema */}
        <div className="card">
          <div className="card-section-label">Required Schema</div>
          <div className="schema-list">
            {["Date","Product_Category","Region","Units_Sold","Unit_Price","Revenue","Status"].map((col) => (
              <div key={col} className="schema-row">
                <span className="schema-dot" />{col}
              </div>
            ))}
          </div>
          <a href="/sample_sales.csv" download className="dl-btn">↓ Download sample CSV</a>
        </div>

        {/* Stack */}
        <div className="card stack-card">
          <div className="card-section-label">Powered by</div>
          <div className="chips">
            <span className="chip chip-blue">Gemini 1.5 Flash</span>
            <span className="chip chip-teal">FastAPI</span>
            <span className="chip chip-orange">pandas</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Success View ──────────────────────────────────────────────────────────────
function SuccessView({ resp, email, onReset }: { resp: ApiResponse; email: string; onReset: () => void }) {
  const m = resp.metrics_summary;
  return (
    <div className="success-wrap">
      <div className="success-banner">
        <div className="success-icon">✓</div>
        <div>
          <div className="success-title">Report Delivered!</div>
          <div className="success-sub">Sent to <strong>{email}</strong> · {m.date_range}</div>
        </div>
      </div>
      <div className="kpi-grid">
        <KpiCard icon="💰" label="Total Revenue"   value={fmt$(m.total_revenue)}         color="blue" />
        <KpiCard icon="📦" label="Units Sold"       value={m.total_units_sold.toLocaleString()} color="green" />
        <KpiCard icon="🏆" label="Top Product"      value={m.top_product_category}        color="indigo" />
        <KpiCard icon="🌏" label="Top Region"       value={m.top_region}                  color="sky" />
      </div>
      <button className="ghost-btn" onClick={onReset}>↩ Analyze Another File</button>
    </div>
  );
}

function KpiCard({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <div className={`kpi-card kpi--${color}`}>
      <div className="kpi-icon">{icon}</div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ANALYTICS PAGE
// ══════════════════════════════════════════════════════════════════════════════
function AnalyticsPage() {
  const metrics = [
    { label: "Total Reports Generated", value: "1,284", delta: "+12%", up: true },
    { label: "Avg. Processing Time",    value: "2.4s",  delta: "-8%",  up: true },
    { label: "Email Delivery Rate",     value: "99.3%", delta: "+0.2%",up: true },
    { label: "Files Processed",         value: "3,912", delta: "+23%", up: true },
  ];
  const bars = [
    { month: "Oct", val: 60 }, { month: "Nov", val: 75 }, { month: "Dec", val: 55 },
    { month: "Jan", val: 88 }, { month: "Feb", val: 72 }, { month: "Mar", val: 95 },
  ];
  return (
    <div className="page-section">
      <div className="page-header">
        <h2 className="page-title">Analytics</h2>
        <p className="page-desc">Platform performance metrics and usage trends</p>
      </div>
      <div className="metrics-grid">
        {metrics.map((m) => (
          <div key={m.label} className="metric-card">
            <div className="metric-label">{m.label}</div>
            <div className="metric-value">{m.value}</div>
            <div className={`metric-delta ${m.up ? "delta-up" : "delta-down"}`}>{m.delta} vs last month</div>
          </div>
        ))}
      </div>
      <div className="card mt-6">
        <div className="card-section-label">Monthly Report Volume</div>
        <div className="bar-chart">
          {bars.map((b) => (
            <div key={b.month} className="bar-col">
              <div className="bar-wrap">
                <div className="bar-fill" style={{ height: `${b.val}%` }} />
              </div>
              <div className="bar-label">{b.month}</div>
              <div className="bar-val">{b.val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// REPORTS PAGE
// ══════════════════════════════════════════════════════════════════════════════
function ReportsPage() {
  const reports = [
    { name: "Q1 Sales Summary",      date: "Mar 10, 2026", status: "Delivered", size: "48 KB" },
    { name: "Feb Regional Analysis", date: "Feb 28, 2026", status: "Delivered", size: "32 KB" },
    { name: "Electronics Quarterly", date: "Feb 15, 2026", status: "Delivered", size: "61 KB" },
    { name: "North America Deep Dive",date: "Jan 30, 2026", status: "Delivered", size: "55 KB" },
    { name: "Year-End 2025 Report",  date: "Dec 31, 2025", status: "Delivered", size: "89 KB" },
  ];
  return (
    <div className="page-section">
      <div className="page-header">
        <h2 className="page-title">Reports</h2>
        <p className="page-desc">History of all AI-generated sales insight reports</p>
      </div>
      <div className="card">
        <table className="reports-table">
          <thead>
            <tr>
              <th>Report Name</th><th>Generated</th><th>Status</th><th>Size</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r, i) => (
              <tr key={i}>
                <td><span className="report-name">{r.name}</span></td>
                <td className="td-muted">{r.date}</td>
                <td><span className="status-badge">{r.status}</span></td>
                <td className="td-muted">{r.size}</td>
                <td><button className="tbl-btn">↓ Download</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// INTEGRATIONS PAGE
// ══════════════════════════════════════════════════════════════════════════════
function IntegrationsPage() {
  const integrations = [
    { name: "Google Gemini",   desc: "AI narrative generation via Gemini 1.5 Flash", status: "Connected",    color: "blue"  },
    { name: "Gmail SMTP",      desc: "Email delivery via Gmail secure SMTP (TLS)",   status: "Connected",    color: "green" },
    { name: "Google Sheets",   desc: "Sync sales data directly from Sheets",         status: "Coming Soon",  color: "gray"  },
    { name: "Slack",           desc: "Send insight summaries to Slack channels",      status: "Coming Soon",  color: "gray"  },
    { name: "Salesforce",      desc: "Pull CRM data and generate AI reports",        status: "Coming Soon",  color: "gray"  },
  ];
  return (
    <div className="page-section">
      <div className="page-header">
        <h2 className="page-title">Integrations</h2>
        <p className="page-desc">Connect Rabbitt AI with your existing tools</p>
      </div>
      <div className="integrations-grid">
        {integrations.map((intg) => (
          <div key={intg.name} className="intg-card">
            <div className="intg-top">
              <div className="intg-name">{intg.name}</div>
              <span className={`intg-badge intg-badge--${intg.color}`}>{intg.status}</span>
            </div>
            <p className="intg-desc">{intg.desc}</p>
            <button className={`intg-btn ${intg.status === "Connected" ? "intg-btn--active" : "intg-btn--disabled"}`}>
              {intg.status === "Connected" ? "Manage" : "Notify Me"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PROFILE PAGE
// ══════════════════════════════════════════════════════════════════════════════
function ProfilePage() {
  return (
    <div className="page-section">
      <div className="page-header">
        <h2 className="page-title">Profile</h2>
        <p className="page-desc">Manage your account information</p>
      </div>
      <div className="card profile-card">
        <div className="profile-avatar-lg">RA</div>
        <div className="profile-fields">
          {[
            { label: "Full Name",     value: "Rabbitt Admin",        type: "text" },
            { label: "Email Address", value: "admin@rabbitt.ai",     type: "email" },
            { label: "Company",       value: "Rabbitt AI",           type: "text" },
            { label: "Role",          value: "Senior DevOps Engineer",type: "text" },
          ].map((f) => (
            <div key={f.label} className="pf-field">
              <label className="pf-label">{f.label}</label>
              <input type={f.type} defaultValue={f.value} className="pf-input" />
            </div>
          ))}
          <button className="submit-btn" style={{ marginTop: "8px" }}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SETTINGS PAGE
// ══════════════════════════════════════════════════════════════════════════════
function SettingsPage() {
  const [toggles, setToggles] = useState({ emailNotif: true, weeklyDigest: false, betaFeatures: false, rateLimit: true });
  const toggle = (key: keyof typeof toggles) => setToggles((p) => ({ ...p, [key]: !p[key] }));
  const settings = [
    { key: "emailNotif",    label: "Email Notifications",  desc: "Receive delivery confirmations after each report" },
    { key: "weeklyDigest",  label: "Weekly Digest",        desc: "Get a weekly summary of all reports sent" },
    { key: "betaFeatures",  label: "Beta Features",        desc: "Opt into early-access features" },
    { key: "rateLimit",     label: "Rate Limiting",        desc: "Enforce 10 requests/min per IP" },
  ] as const;
  return (
    <div className="page-section">
      <div className="page-header">
        <h2 className="page-title">Settings</h2>
        <p className="page-desc">Configure your platform preferences</p>
      </div>
      <div className="card settings-card">
        {settings.map((s) => (
          <div key={s.key} className="setting-row">
            <div className="setting-info">
              <div className="setting-label">{s.label}</div>
              <div className="setting-desc">{s.desc}</div>
            </div>
            <button className={`toggle ${toggles[s.key] ? "toggle--on" : ""}`} onClick={() => toggle(s.key)}>
              <span className="toggle-knob" />
            </button>
          </div>
        ))}
      </div>
      <div className="card mt-4 danger-card">
        <div className="card-section-label" style={{ color: "#ef4444" }}>Danger Zone</div>
        <div className="setting-row">
          <div>
            <div className="setting-label">Reset API Keys</div>
            <div className="setting-desc">Revoke and regenerate all API credentials</div>
          </div>
          <button className="danger-btn">Reset Keys</button>
        </div>
      </div>
    </div>
  );
}

// ── Inline SVG Icons ──────────────────────────────────────────────────────────
function LayersIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>; }
function ChartIcon()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>; }
function PulseIcon()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>; }
function DocIcon()    { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>; }
function LinkIcon()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>; }
function UserIcon()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>; }
function GearIcon()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>; }
function UploadIcon() { return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>; }
function FileIcon()   { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>; }
function EmailIcon()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>; }
function SmallSpinner() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ animation: "spin .7s linear infinite" }}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity=".25"/><path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>; }
