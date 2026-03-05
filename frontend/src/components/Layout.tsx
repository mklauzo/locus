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
import 'dayjs/locale/en';
import 'flag-icons/css/flag-icons.min.css';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { useAuthContext } from '../App';
import { WeatherData } from '../types';
import api from '../api';
import { useAutoLogout } from '../hooks/useAutoLogout';

dayjs.locale(localStorage.getItem('locus_lang') || 'pl');

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
  const { user, logout, autoLogoutSettings } = useAuthContext();
  useAutoLogout(autoLogoutSettings, logout);
  const navigate = useNavigate();
  const { t, i18n: i18nInstance } = useTranslation();
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

  const handleLang = (lang: 'pl' | 'en') => {
    i18nInstance.changeLanguage(lang);
    localStorage.setItem('locus_lang', lang);
    dayjs.locale(lang);
    setNow(dayjs());
  };

  const weatherIcon = weather?.icon ? WEATHER_ICONS[weather.icon.substring(0, 2)] : null;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed">
        <Toolbar sx={{ minHeight: { xs: 52, sm: 64 } }}>
          {/* Weather — pełny chip na sm+, tylko ikona+temp na xs */}
          {weather && (
            <>
              <Chip
                icon={<>{weatherIcon}</>}
                label={`${Math.round(weather.temp)}°C ${weather.description}`}
                size="small"
                variant="outlined"
                sx={{ color: 'inherit', borderColor: 'rgba(255,255,255,0.5)', display: { xs: 'none', sm: 'flex' } }}
              />
              <Chip
                icon={<>{weatherIcon}</>}
                label={`${Math.round(weather.temp)}°C`}
                size="small"
                variant="outlined"
                sx={{ color: 'inherit', borderColor: 'rgba(255,255,255,0.5)', display: { xs: 'flex', sm: 'none' } }}
              />
            </>
          )}
          {/* Data — ukryta na mobile */}
          <Typography variant="body2" sx={{ opacity: 0.9, ml: 1, display: { xs: 'none', md: 'block' } }}>
            {now.format('dddd, D MMMM YYYY')}
          </Typography>

          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: 2 }}>
            LOCUS booking
          </Typography>
          <Box sx={{ flexGrow: 1 }} />

          {/* Language switcher */}
          <Box sx={{ display: 'flex', gap: 0.5, mr: 1 }}>
            <IconButton
              size="small"
              onClick={() => handleLang('pl')}
              sx={{ opacity: i18nInstance.language === 'pl' ? 1 : 0.35, p: 0.5 }}
            >
              <span className="fi fi-pl" style={{ width: 22, height: 16, display: 'block', borderRadius: 2 }} />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => handleLang('en')}
              sx={{ opacity: i18nInstance.language === 'en' ? 1 : 0.35, p: 0.5 }}
            >
              <span className="fi fi-gb" style={{ width: 22, height: 16, display: 'block', borderRadius: 2 }} />
            </IconButton>
          </Box>

          {/* Username — ukryty na mobile */}
          <Typography variant="body2" sx={{ mr: 1, opacity: 0.8, display: { xs: 'none', sm: 'block' } }}>
            {user?.username}
          </Typography>
          <IconButton color="inherit" onClick={() => setDrawerOpen(true)}>
            <MenuIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: 250, pt: 2 }}>
          {/* Username w menu na mobile */}
          <Box sx={{ px: 2, pb: 1, display: { sm: 'none' } }}>
            <Typography variant="body2" color="text.secondary">{user?.username}</Typography>
          </Box>
          <List>
            <ListItemButton onClick={() => { navigate('/'); setDrawerOpen(false); }}>
              <ListItemIcon><HotelIcon /></ListItemIcon>
              <ListItemText primary={t('nav.hotels')} />
            </ListItemButton>
            {user?.role === 'ADMIN' && (
              <ListItemButton onClick={() => { navigate('/users'); setDrawerOpen(false); }}>
                <ListItemIcon><PeopleIcon /></ListItemIcon>
                <ListItemText primary={t('nav.users')} />
              </ListItemButton>
            )}
            <ListItemButton onClick={() => { navigate('/settings'); setDrawerOpen(false); }}>
              <ListItemIcon><SettingsIcon /></ListItemIcon>
              <ListItemText primary={t('nav.settings')} />
            </ListItemButton>
            <Divider sx={{ my: 1 }} />
            <ListItemButton onClick={() => { logout(); navigate('/login'); }}>
              <ListItemIcon><LogoutIcon /></ListItemIcon>
              <ListItemText primary={t('nav.logout')} />
            </ListItemButton>
          </List>
        </Box>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, pt: { xs: 8, sm: 10 }, px: { xs: 1.5, sm: 3 }, pb: 3 }}>
        <Outlet />
      </Box>
    </Box>
  );
}
