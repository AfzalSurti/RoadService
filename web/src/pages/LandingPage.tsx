import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth";
import { DeveloperCredit } from "../components/DeveloperCredit";

export function LandingPage() {
  const { token } = useAuth();
  if (token) return <Navigate to="/dashboard" replace />;

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="brand">
          Road<span>Service</span>
        </div>
        <div className="landing-nav-actions">
          <Link className="btn ghost" to="/login">
            Sign in
          </Link>
          <Link className="btn" to="/login">
            Open dashboard
          </Link>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow">Road issue management</p>
          <h1 className="brand landing-title">
            Road<span>Service</span>
          </h1>
          <p className="landing-lead">
            Track defects from survey to close — photo proof, GPS, and role-based verification in one
            place.
          </p>
          <div className="landing-cta">
            <Link className="btn" to="/login">
              Sign in to continue
            </Link>
            <a className="btn secondary" href="#how-it-works">
              How it works
            </a>
          </div>
        </div>
        <div className="landing-hero-visual" aria-hidden="true">
          <div className="landing-road" />
          <div className="landing-card-stack">
            <div className="landing-float-card">
              <span className="badge status-open">Open</span>
              <strong>Pothole · km 12+400</strong>
              <small>Assigned to contractor</small>
            </div>
            <div className="landing-float-card alt">
              <span className="badge status-verification_pending">Verification</span>
              <strong>Camera + GPS submitted</strong>
              <small>Awaiting surveyor review</small>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section" id="how-it-works">
        <h2>One workflow, clear ownership</h2>
        <p className="muted landing-section-lead">
          Surveyors raise issues in the field. Contractors fix and submit proof. Admins and surveyors
          verify. Government stays informed.
        </p>
        <div className="landing-steps">
          <article>
            <span>01</span>
            <h3>Report</h3>
            <p>Capture defect type, location, and before photos from the mobile surveyor app.</p>
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
            <h3>Admin</h3>
            <p>Users, projects, deadlines, and full verification control.</p>
          </div>
          <div>
            <h3>Government</h3>
            <p>Read-only dashboard, map, and reports for oversight.</p>
          </div>
          <div>
            <h3>Contractor</h3>
            <p>Web + mobile tools to execute and prove completion.</p>
          </div>
          <div>
            <h3>Surveyor</h3>
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
