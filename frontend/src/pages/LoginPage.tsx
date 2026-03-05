import { useState } from 'react';
import { Box, Card, CardContent, TextField, Button, Typography, Alert } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAuthContext } from '../App';

export default function LoginPage() {
  const { login } = useAuthContext();
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(username, password);
    } catch {
      setError(t('login.error'));
    }
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Card sx={{ maxWidth: 400, width: '100%', mx: 2 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h4" align="center" sx={{ mb: 3, fontWeight: 700, letterSpacing: 3 }}>
            {t('login.title')}
          </Typography>
          <Typography variant="body2" align="center" sx={{ mb: 3, color: 'text.secondary' }}>
            {t('login.subtitle')}
          </Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth label={t('login.usernameLabel')} value={username}
              onChange={e => setUsername(e.target.value)}
              sx={{ mb: 2 }} autoFocus
            />
            <TextField
              fullWidth label={t('login.passwordLabel')} type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              sx={{ mb: 3 }}
            />
            <Button type="submit" fullWidth variant="contained" size="large">
              {t('login.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
