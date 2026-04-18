import { Navigate, Route, Routes } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import PickerPage from "./pages/PickerPage";
import RecordPage from "./pages/RecordPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/picker" element={<PickerPage />} />
      <Route path="/record" element={<RecordPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
