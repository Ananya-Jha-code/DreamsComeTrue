import { useNavigate } from "react-router-dom";

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="text-7xl mb-8 select-none" aria-hidden>
        🌙
      </div>
      <h1 className="text-3xl md:text-4xl text-center text-amber-soft/95 tracking-tight mb-3">
        Tell a story. Watch it become a film.
      </h1>
      <p className="text-center text-amber-glow/70 text-sm max-w-md mb-12">
        A story does not have one correct form. Lullaby makes that literal.
      </p>
      <button
        type="button"
        onClick={() => navigate("/picker")}
        className="rounded-full bg-amber-glow/15 hover:bg-amber-glow/25 border border-amber-glow/40 text-amber-soft px-10 py-3 text-sm font-sans tracking-wide transition-colors"
      >
        Begin
      </button>
    </div>
  );
}

