import { BrowserRouter as Router, Navigate, Routes, Route } from "react-router";
import NotFound from "./pages/OtherPage/NotFound";
import AppLayout from "./layout/AppLayout";
import { ScrollToTop } from "./components/common/ScrollToTop";
import ResrvaDashboard from "./pages/Dashboard/ResrvaDashboard";
import PublicBooking from "./pages/PublicBooking";
import PublicFunctionRequest from "./pages/PublicFunctionRequest";
import PublicTerms from "./pages/PublicTerms";
import Login from "./pages/Login";
import BookingsPage from "./pages/BookingsPage";
import FunctionsPage from "./pages/FunctionsPage";
import ResrvaCalendar from "./pages/ResrvaCalendar";
import TablesAreasPage from "./pages/TablesAreasPage";
import UsersPage from "./pages/UsersPage";
import SettingsPage from "./pages/SettingsPage";
import ProfilePage from "./pages/ProfilePage";
import BookingTypesPage from "./pages/BookingTypesPage";
import VenuesPage from "./pages/VenuesPage";
import ClientsPage from "./pages/ClientsPage";
import { PlatformAdminRoute, ProtectedRoute } from "./components/resrva/ProtectedRoute";

export default function App() {
  return (
    <>
      <Router>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<PublicBooking />} />
          <Route path="/functions" element={<PublicFunctionRequest />} />
          <Route path="/terms" element={<PublicTerms />} />
          <Route path="/signin" element={<Login />} />
          <Route path="/:venueSlug" element={<PublicBooking />} />
          <Route path="/:venueSlug/functions" element={<PublicFunctionRequest />} />
          <Route path="/:venueSlug/terms" element={<PublicTerms />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/app" element={<AppLayout />}>
              <Route index element={<ResrvaDashboard />} />
              <Route path="bookings" element={<BookingsPage />} />
              <Route path="functions" element={<FunctionsPage />} />
              <Route path="calendar" element={<ResrvaCalendar />} />
              <Route path="booking-types" element={<BookingTypesPage />} />
              <Route path="tables" element={<TablesAreasPage />} />
              <Route path="venues" element={<VenuesPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route element={<PlatformAdminRoute />}>
                <Route path="clients" element={<Navigate to="/app/resrva-admin/clients" replace />} />
                <Route path="resrva-admin/clients" element={<ClientsPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </>
  );
}
