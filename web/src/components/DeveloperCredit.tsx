export function DeveloperCredit({ className = "" }: { className?: string }) {
  return (
    <p className={`developer-credit ${className}`.trim()}>
      Developed by{" "}
      <a
        className="developer-credit-name"
        href="https://www.linkedin.com/in/afzal-surti-9904b2287/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Afzal N. Surti
      </a>
      <span className="developer-credit-sep">&amp;</span>
      Powered By{" "}
      <a
        className="developer-credit-logo-link"
        href="https://geogroup.in/"
        target="_blank"
        rel="noopener noreferrer"
        title="Geo Designs & Research — geogroup.in"
        aria-label="Powered by Geo Designs and Research, opens geogroup.in"
      >
        <img src="/gdr-logo.png" alt="GDR — Geo Designs & Research" className="developer-credit-logo" />
      </a>
    </p>
  );
}
