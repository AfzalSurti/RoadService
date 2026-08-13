import { useNavigate } from "react-router-dom";

/** Goes to the previous browser/app history entry; falls back to dashboard. */
export function BackButton({ fallback = "/dashboard" }: { fallback?: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="btn ghost back-btn"
      onClick={() => {
        if (window.history.length > 1) {
          navigate(-1);
        } else {
          navigate(fallback);
        }
      }}
      title="Go back"
    >
      ← Back
    </button>
  );
}
