import { useState, useEffect, useMemo, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import 'dayjs/locale/pl';
import { useAuth } from './hooks/useAuth';
import { User } from './types';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import HotelsPage from './pages/HotelsPage';
import HotelDetailPage from './pages/HotelDetailPage';
import RoomsPage from './pages/RoomsPage';
import ReservationsPage from './pages/ReservationsPage';
import ReservationDetailPage from './pages/ReservationDetailPage';
import CalendarPage from './pages/CalendarPage';
import UsersPage from './pages/UsersPage';
import SettingsPage from './pages/SettingsPage';

interface AuthContextType {
  user: User | null;
  login: (u: string, p: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  login: async () => {},
  logout: () => {},
});

export const useAuthContext = () => useContext(AuthContext);

const DEFAULT_THEME = { mode: 'light' as const, color: '#1976d2' };

function getStoredTheme(username?: string): { mode: 'light' | 'dark'; color: string } {
  try {
    const key = username ? `locus_theme_${username}` : 'locus_theme';
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved);
  } catch {}
  return { ...DEFAULT_THEME };
}

export default function App() {
  const { user, loading, login, logout } = useAuth();
  const [themeSettings, setThemeSettings] = useState(DEFAULT_THEME);

  // Load user-specific theme when user changes
  useEffect(() => {
    setThemeSettings(getStoredTheme(user?.username));
  }, [user?.username]);

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: themeSettings.mode,
          primary: { main: themeSettings.color },
        },
      }),
    [themeSettings]
  );

  const updateTheme = (settings: { mode: 'light' | 'dark'; color: string }) => {
    setThemeSettings(settings);
    if (user?.username) {
      localStorage.setItem(`locus_theme_${user.username}`, JSON.stringify(settings));
    }
  };

  if (loading) return null;

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="pl">
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
              <Route element={user ? <Layout /> : <Navigate to="/login" />}>
                <Route path="/" element={<HotelsPage />} />
                <Route path="/hotels/:id" element={<HotelDetailPage />} />
                <Route path="/hotels/:hotelId/rooms" element={<RoomsPage />} />
                <Route path="/hotels/:hotelId/reservations" element={<ReservationsPage />} />
                <Route path="/hotels/:hotelId/reservations/:id" element={<ReservationDetailPage />} />
                <Route path="/hotels/:hotelId/calendar" element={<CalendarPage />} />
                {user?.role === 'ADMIN' && <Route path="/users" element={<UsersPage />} />}
                <Route path="/settings" element={<SettingsPage themeSettings={themeSettings} onUpdateTheme={updateTheme} />} />
              </Route>
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </BrowserRouter>
        </LocalizationProvider>
      </ThemeProvider>
    </AuthContext.Provider>
  );
}
