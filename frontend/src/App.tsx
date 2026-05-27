import { BrowserRouter as Router, Routes, Route } from "react-router";
import NotFound from "./pages/OtherPage/NotFound";
import AppLayout from "./layout/AppLayout";
import { ScrollToTop } from "./components/common/ScrollToTop";
import ResrvaDashboard from "./pages/Dashboard/ResrvaDashboard";
import PublicBooking from "./pages/PublicBooking";
import PublicFunctionRequest from "./pages/PublicFunctionRequest";
import Login from "./pages/Login";
import BookingsPage from "./pages/BookingsPage";
import FunctionsPage from "./pages/FunctionsPage";
import ResrvaCalendar from "./pages/ResrvaCalendar";
import TablesAreasPage from "./pages/TablesAreasPage";
import UsersPage from "./pages/UsersPage";
import SettingsPage from "./pages/SettingsPage";
import ProfilePage from "./pages/ProfilePage";
import { ProtectedRoute } from "./components/resrva/ProtectedRoute";

export default function App() {
  return (
    <>
      <Router>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<PublicBooking />} />
          <Route path="/functions" element={<PublicFunctionRequest />} />
          <Route path="/signin" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/app" element={<AppLayout />}>
              <Route index element={<ResrvaDashboard />} />
              <Route path="bookings" element={<BookingsPage />} />
              <Route path="functions" element={<FunctionsPage />} />
              <Route path="calendar" element={<ResrvaCalendar />} />
              <Route path="tables" element={<TablesAreasPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="profile" element={<ProfilePage />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </>
  );
}
