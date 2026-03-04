import { useState } from 'react';
import { Box, Card, CardContent, TextField, Button, Typography, Alert } from '@mui/material';
import { useAuthContext } from '../App';

export default function LoginPage() {
  const { login } = useAuthContext();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(username, password);
    } catch {
      setError('Nieprawidłowa nazwa użytkownika lub hasło');
    }
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Card sx={{ maxWidth: 400, width: '100%', mx: 2 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h4" align="center" sx={{ mb: 3, fontWeight: 700, letterSpacing: 3 }}>
            LOCUS booking
          </Typography>
          <Typography variant="body2" align="center" sx={{ mb: 3, color: 'text.secondary' }}>
            System rezerwacji hotelowych
          </Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth label="Nazwa użytkownika" value={username}
              onChange={e => setUsername(e.target.value)}
              sx={{ mb: 2 }} autoFocus
            />
            <TextField
              fullWidth label="Hasło" type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              sx={{ mb: 3 }}
            />
            <Button type="submit" fullWidth variant="contained" size="large">
              Zaloguj się
            </Button>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
