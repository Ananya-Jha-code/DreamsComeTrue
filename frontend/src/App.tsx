import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import PickerPage from "./pages/PickerPage";
import RecordPage from "./pages/RecordPage";
import LoadingPage from "./pages/LoadingPage";
import BookPage from "./pages/BookPage";

const PATHS = ["/", "/picker", "/record", "/loading", "/book"];

function getComponent(pathname: string) {
  if (pathname === "/picker") return <PickerPage />;
  if (pathname === "/record") return <RecordPage />;
  if (pathname === "/loading") return <LoadingPage />;
  if (pathname === "/book") return <BookPage />;
  return <LandingPage />;
}

export default function App() {
  const location = useLocation();
  const [activePath, setActivePath] = useState(location.pathname);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const prevIdxRef = useRef(PATHS.indexOf(location.pathname));

  useEffect(() => {
    if (location.pathname === activePath) return;

    const toIdx = PATHS.indexOf(location.pathname);

    setPendingPath(location.pathname);
    setAnimating(true);

    // After exit animation completes, switch page and animate in
    const t = setTimeout(() => {
      prevIdxRef.current = toIdx;
      setActivePath(location.pathname);
      setPendingPath(null);
      setAnimating(false);
    }, 480);

    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toIdx = pendingPath ? PATHS.indexOf(pendingPath) : PATHS.indexOf(activePath);
  const fwd = toIdx >= prevIdxRef.current;

  return (
    <>
      <style>{`
        @keyframes exit-fwd  { from{transform:perspective(1200px) rotateY(0deg);opacity:1} to{transform:perspective(1200px) rotateY(-80deg) scale(.88);opacity:0} }
        @keyframes exit-bwd  { from{transform:perspective(1200px) rotateY(0deg);opacity:1} to{transform:perspective(1200px) rotateY(80deg) scale(.88);opacity:0} }
        @keyframes enter-fwd { from{transform:perspective(1200px) rotateY(80deg) scale(.88);opacity:0} to{transform:perspective(1200px) rotateY(0deg);opacity:1} }
        @keyframes enter-bwd { from{transform:perspective(1200px) rotateY(-80deg) scale(.88);opacity:0} to{transform:perspective(1200px) rotateY(0deg);opacity:1} }
        .anim-exit-fwd  { animation: exit-fwd  0.45s cubic-bezier(0.4,0,1,1) forwards; }
        .anim-exit-bwd  { animation: exit-bwd  0.45s cubic-bezier(0.4,0,1,1) forwards; }
        .anim-enter-fwd { animation: enter-fwd 0.45s cubic-bezier(0,0,0.2,1) forwards; }
        .anim-enter-bwd { animation: enter-bwd 0.45s cubic-bezier(0,0,0.2,1) forwards; }
      `}</style>

      <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden" }}>
        {/* Active page — animates OUT when navigating */}
        <div
          key={activePath}
          className={animating ? (fwd ? "anim-exit-fwd" : "anim-exit-bwd") : ""}
          style={{ position: animating ? "absolute" : "relative", inset: 0 }}
        >
          {getComponent(activePath)}
        </div>

        {/* Incoming page — animates IN after exit */}
        {!animating && location.pathname !== activePath && (
          <div
            key={location.pathname}
            className={fwd ? "anim-enter-fwd" : "anim-enter-bwd"}
            style={{ position: "relative" }}
          >
            {getComponent(location.pathname)}
          </div>
        )}
      </div>
    </>
  );
}
