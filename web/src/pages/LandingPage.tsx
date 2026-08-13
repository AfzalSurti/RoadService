import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth";
import { DeveloperCredit } from "../components/DeveloperCredit";

export function LandingPage() {
  const { token } = useAuth();
  if (token) return <Navigate to="/dashboard" replace />;

  return (
    <div className="landing">
      <div className="landing-bg" aria-hidden="true">
        <div className="landing-bg-photo" />
        <div className="landing-bg-wash" />
        <div className="landing-bg-glow" />
        <div className="landing-bg-grain" />
      </div>

      <header className="landing-nav">
        <div className="brand landing-brand">
          Road<span>Service</span>
        </div>
        <div className="landing-nav-actions">
          <Link className="btn ghost landing-btn-ghost" to="/login">
            Sign in
          </Link>
          <Link className="btn landing-btn-solid" to="/login">
            Open dashboard
          </Link>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow">Highway defect lifecycle</p>
          <h1 className="brand landing-title">
            Road<span>Service</span>
          </h1>
          <p className="landing-lead">
            From field capture to verified close — photo proof, GPS, and clear ownership for every
            stretch of road.
          </p>
          <div className="landing-cta">
            <Link className="btn landing-btn-solid" to="/login">
              Sign in to continue
            </Link>
            <a className="btn secondary landing-btn-ghost" href="#how-it-works">
              How it works
            </a>
          </div>
        </div>
      </section>

      <section className="landing-section" id="how-it-works">
        <h2>One workflow, clear ownership</h2>
        <p className="muted landing-section-lead">
          GMC representatives raise issues in the field. Contractors fix and submit proof. GMC Experts
          (MIS Expert) verify. NHIPMPL representatives stay informed.
        </p>
        <div className="landing-steps">
          <article>
            <span>01</span>
            <h3>Report</h3>
            <p>Capture defect type, location, and before photos from the GMC representative app.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Repair</h3>
            <p>Contractors move work To Do → In Progress, then submit camera, GPS, and remarks.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Verify</h3>
            <p>Approve to close within 24 hours, or send back for rework with clear comments.</p>
          </article>
        </div>
      </section>

      <section className="landing-section landing-roles">
        <h2>Built for every role</h2>
        <div className="landing-role-grid">
          <div>
            <h3>GMC Experts (MIS Expert)</h3>
            <p>Users, projects, deadlines, and full verification control.</p>
          </div>
          <div>
            <h3>NHIPMPL representative</h3>
            <p>Read-only dashboard, map, and reports for oversight.</p>
          </div>
          <div>
            <h3>Contractor</h3>
            <p>Web + mobile tools to execute and prove completion.</p>
          </div>
          <div>
            <h3>GMC representative</h3>
            <p>Mobile-first reporting and on-site verification.</p>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-top">
          <div className="brand">
            Road<span>Service</span>
          </div>
          <Link to="/login">Sign in</Link>
        </div>
        <DeveloperCredit />
      </footer>
    </div>
  );
}
