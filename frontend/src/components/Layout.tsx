import { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import {
  AppBar, Toolbar, Typography, Box, IconButton, Drawer, List, ListItemButton,
  ListItemIcon, ListItemText, Divider, Chip,
} from '@mui/material';
import {
  Menu as MenuIcon, Hotel as HotelIcon, People as PeopleIcon,
  Settings as SettingsIcon, Logout as LogoutIcon,
  WbSunny, Cloud, Thunderstorm, AcUnit, Water, Grain,
} from '@mui/icons-material';
import dayjs from 'dayjs';
import 'dayjs/locale/pl';
import { useAuthContext } from '../App';
import { WeatherData } from '../types';
import api from '../api';

dayjs.locale('pl');

const WEATHER_ICONS: Record<string, React.ReactNode> = {
  '01': <WbSunny fontSize="small" />,
  '02': <Cloud fontSize="small" />,
  '03': <Cloud fontSize="small" />,
  '04': <Cloud fontSize="small" />,
  '09': <Grain fontSize="small" />,
  '10': <Water fontSize="small" />,
  '11': <Thunderstorm fontSize="small" />,
  '13': <AcUnit fontSize="small" />,
  '50': <Cloud fontSize="small" />,
};

export default function Layout() {
  const { user, logout } = useAuthContext();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [now, setNow] = useState(dayjs());

  useEffect(() => {
    const timer = setInterval(() => setNow(dayjs()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    api.get('/weather/').then(res => setWeather(res.data)).catch(() => {});
  }, []);

  const weatherIcon = weather?.icon ? WEATHER_ICONS[weather.icon.substring(0, 2)] : null;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed">
        <Toolbar>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {weather && (
              <Chip
                icon={<>{weatherIcon}</>}
                label={`${Math.round(weather.temp)}°C ${weather.description}`}
                size="small"
                variant="outlined"
                sx={{ color: 'inherit', borderColor: 'rgba(255,255,255,0.5)' }}
              />
            )}
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              {now.format('dddd, D MMMM YYYY')}
            </Typography>
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: 2 }}>
            LOCUS
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="body2" sx={{ mr: 1, opacity: 0.8 }}>
            {user?.username}
          </Typography>
          <IconButton color="inherit" onClick={() => setDrawerOpen(true)}>
            <MenuIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: 250, pt: 2 }}>
          <List>
            <ListItemButton onClick={() => { navigate('/'); setDrawerOpen(false); }}>
              <ListItemIcon><HotelIcon /></ListItemIcon>
              <ListItemText primary="Hotele" />
            </ListItemButton>
            {user?.role === 'ADMIN' && (
              <ListItemButton onClick={() => { navigate('/users'); setDrawerOpen(false); }}>
                <ListItemIcon><PeopleIcon /></ListItemIcon>
                <ListItemText primary="Użytkownicy" />
              </ListItemButton>
            )}
            <ListItemButton onClick={() => { navigate('/settings'); setDrawerOpen(false); }}>
              <ListItemIcon><SettingsIcon /></ListItemIcon>
              <ListItemText primary="Ustawienia" />
            </ListItemButton>
            <Divider sx={{ my: 1 }} />
            <ListItemButton onClick={() => { logout(); navigate('/login'); }}>
              <ListItemIcon><LogoutIcon /></ListItemIcon>
              <ListItemText primary="Wyloguj" />
            </ListItemButton>
          </List>
        </Box>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, pt: 10, px: 3, pb: 3 }}>
        <Outlet />
      </Box>
    </Box>
  );
}
