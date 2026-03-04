import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, Card, CardContent, Button, Box, Alert, CircularProgress,
  TextField, MenuItem, ListSubheader, IconButton, Divider, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, Tooltip, InputAdornment,
  Switch, FormControlLabel,
} from '@mui/material';
import {
  ArrowBack, SmartToy, Add, Save, Delete, UploadFile,
  Visibility, VisibilityOff, Description, Refresh, Edit,
} from '@mui/icons-material';
import api from '../api';
import { AIAssistant, AIAssistantDocument } from '../types';

interface ModelOption { value: string; label: string }
interface ModelGroup { group: string; provider: string; models: ModelOption[] }

const STATIC_MODELS: ModelGroup[] = [
  { group: 'OpenAI', provider: 'openai', models: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  ]},
  { group: 'Anthropic', provider: 'anthropic', models: [
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
  ]},
  { group: 'Google Gemini', provider: 'gemini', models: [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  ]},
  { group: 'Ollama (lokalny)', provider: 'ollama', models: [
    { value: 'ollama:llama3.2', label: 'llama3.2' },
    { value: 'ollama:llama3.1', label: 'llama3.1' },
    { value: 'ollama:mistral', label: 'mistral' },
    { value: 'ollama:gemma3', label: 'gemma3' },
    { value: 'ollama:phi4-mini', label: 'phi4-mini' },
    { value: 'ollama:deepseek-r1:8b', label: 'deepseek-r1:8b' },
  ]},
];

function detectProvider(model: string): string {
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gemini')) return 'gemini';
  if (model.startsWith('ollama:')) return 'ollama';
  return 'openai';
}

function apiKeyHint(model: string): string {
  if (model.startsWith('claude')) return 'Klucz Anthropic (sk-ant-...)';
  if (model.startsWith('gemini')) return 'Klucz Google AI Studio (AIza...)';
  if (model.startsWith('ollama:')) return 'Ollama nie wymaga klucza API';
  return 'Klucz OpenAI (sk-...)';
}

const EMPTY_FORM = {
  name: '',
  llm_model: 'gpt-4o-mini',
  llm_api_key: '',
  ollama_url: 'http://ollama:11434',
  system_prompt: '',
  is_active: true,
};

export default function AIAssistantPage() {
  const { hotelId } = useParams();
  const navigate = useNavigate();

  const [assistants, setAssistants] = useState<AIAssistant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [docToDelete, setDocToDelete] = useState<{ assistantId: number; doc: AIAssistantDocument } | null>(null);
  const [docToEdit, setDocToEdit] = useState<{ assistantId: number; doc: AIAssistantDocument } | null>(null);
  const [docEditForm, setDocEditForm] = useState({ name: '', content: '' });
  const [docEditSaving, setDocEditSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeAssistantId, setActiveAssistantId] = useState<number | null>(null);

  // Dynamic model lists per provider (keyed by provider string)
  const [dynamicModels, setDynamicModels] = useState<Record<string, ModelOption[]>>({});
  const [refreshing, setRefreshing] = useState<string | null>(null); // provider being refreshed

  const getModels = (group: ModelGroup): ModelOption[] =>
    dynamicModels[group.provider] ?? group.models;

  const allMenuItems = STATIC_MODELS.flatMap(g => getModels(g));
  const selectedModel = allMenuItems.find(m => m.value === form.llm_model);
  const isOllama = form.llm_model.startsWith('ollama:');

  const load = () => {
    setLoading(true);
    api.get(`/hotels/${hotelId}/ai-assistant/`)
      .then(r => setAssistants(r.data.results || r.data))
      .catch(() => setAssistants([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [hotelId]);

  const handleRefresh = async (group: ModelGroup) => {
    setRefreshing(group.provider);
    try {
      const res = await api.post('/fetch-llm-models/', {
        provider: group.provider,
        api_key: form.llm_api_key,
        ollama_url: form.ollama_url,
      });
      const models: ModelOption[] = res.data;
      if (models.length === 0) {
        setAlert({ type: 'error', text: `Brak modeli dla ${group.group}.` });
        return;
      }
      setDynamicModels(prev => ({ ...prev, [group.provider]: models }));
      // If current model not in new list, switch to first
      if (!models.find(m => m.value === form.llm_model) && detectProvider(form.llm_model) === group.provider) {
        setForm(f => ({ ...f, llm_model: models[0].value }));
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || `Błąd pobierania modeli ${group.group}.`;
      setAlert({ type: 'error', text: msg });
    } finally {
      setRefreshing(null);
    }
  };

  const handleAdd = () => {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setShowApiKey(false);
    setShowForm(true);
    setAlert(null);
  };

  const handleEdit = (assistant: AIAssistant) => {
    setForm({
      name: assistant.name,
      llm_model: assistant.llm_model,
      llm_api_key: assistant.llm_api_key,
      ollama_url: assistant.ollama_url || 'http://localhost:11434',
      system_prompt: assistant.system_prompt,
      is_active: assistant.is_active,
    });
    setEditingId(assistant.id);
    setShowApiKey(false);
    setShowForm(true);
    setAlert(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setAlert({ type: 'error', text: 'Podaj nazwę asystenta.' });
      return;
    }
    setSaving(true);
    setAlert(null);
    try {
      if (editingId) {
        await api.patch(`/hotels/${hotelId}/ai-assistant/${editingId}/`, form);
        setAlert({ type: 'success', text: 'Asystent zaktualizowany.' });
      } else {
        await api.post(`/hotels/${hotelId}/ai-assistant/`, form);
        setAlert({ type: 'success', text: 'Asystent utworzony.' });
      }
      setShowForm(false);
      load();
    } catch (err: any) {
      const resp = err.response?.data;
      const msg = resp
        ? (typeof resp === 'string' ? resp : Object.values(resp).flat().join(', '))
        : 'Błąd zapisywania.';
      setAlert({ type: 'error', text: String(msg) });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (assistant: AIAssistant) => {
    if (!confirm(`Usunąć asystenta "${assistant.name}"?`)) return;
    try {
      await api.delete(`/hotels/${hotelId}/ai-assistant/${assistant.id}/`);
      load();
    } catch {}
  };

  const handleToggleActive = async (assistant: AIAssistant) => {
    try {
      await api.patch(`/hotels/${hotelId}/ai-assistant/${assistant.id}/`, { is_active: !assistant.is_active });
      load();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Błąd zmiany stanu asystenta.';
      setAlert({ type: 'error', text: msg });
    }
  };

  const handleUploadClick = (assistantId: number) => {
    setActiveAssistantId(assistantId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || activeAssistantId === null) return;
    e.target.value = '';

    setUploading(activeAssistantId);
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.post(`/hotels/${hotelId}/ai-assistant/${activeAssistantId}/documents/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      load();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Błąd przesyłania pliku.';
      setAlert({ type: 'error', text: msg });
    } finally {
      setUploading(null);
      setActiveAssistantId(null);
    }
  };

  const handleDeleteDoc = async () => {
    if (!docToDelete) return;
    try {
      await api.delete(`/hotels/${hotelId}/ai-assistant/${docToDelete.assistantId}/documents/${docToDelete.doc.id}/`);
      load();
    } catch {}
    setDocToDelete(null);
  };

  const handleOpenDocEdit = (assistantId: number, doc: AIAssistantDocument) => {
    setDocToEdit({ assistantId, doc });
    setDocEditForm({ name: doc.name, content: doc.content });
  };

  const handleSaveDocEdit = async () => {
    if (!docToEdit) return;
    setDocEditSaving(true);
    try {
      await api.patch(
        `/hotels/${hotelId}/ai-assistant/${docToEdit.assistantId}/documents/${docToEdit.doc.id}/`,
        docEditForm,
      );
      load();
      setDocToEdit(null);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Błąd zapisywania dokumentu.';
      setAlert({ type: 'error', text: msg });
    } finally {
      setDocEditSaving(false);
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}><CircularProgress /></Box>;
  }

  const currentProvider = detectProvider(form.llm_model);
  const currentGroup = STATIC_MODELS.find(g => g.provider === currentProvider);

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".txt,.md,.pdf,.docx"
        onChange={handleFileChange}
      />

      <Button startIcon={<ArrowBack />} onClick={() => navigate(`/hotels/${hotelId}`)} sx={{ mb: 2 }}>
        Powrót do hotelu
      </Button>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Asystent AI</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={handleAdd}>
          Dodaj asystenta AI
        </Button>
      </Box>

      {alert && (
        <Alert severity={alert.type} sx={{ mb: 2 }} onClose={() => setAlert(null)}>
          {alert.text}
        </Alert>
      )}

      {/* Form dialog */}
      <Dialog open={showForm} onClose={() => setShowForm(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? 'Edytuj asystenta AI' : 'Nowy asystent AI'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="Nazwa asystenta"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            fullWidth
            required
          />

          {/* Model selector + Refresh button */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <TextField
              label="Model AI"
              select
              value={
                // Ensure selected value exists in list; if not show it as-is
                allMenuItems.find(m => m.value === form.llm_model) ? form.llm_model : form.llm_model
              }
              onChange={e => setForm({ ...form, llm_model: e.target.value })}
              fullWidth
              SelectProps={{ MenuProps: { PaperProps: { style: { maxHeight: 400 } } } }}
              helperText={selectedModel ? '' : form.llm_model}
            >
              {STATIC_MODELS.map(group => [
                <ListSubheader key={group.group} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {group.group}
                  {dynamicModels[group.provider] && (
                    <Chip label="odświeżono" size="small" color="success" sx={{ ml: 1, height: 18, fontSize: 10 }} />
                  )}
                </ListSubheader>,
                ...getModels(group).map(m => (
                  <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                )),
              ])}
            </TextField>

            <Tooltip title={`Odśwież modele ${currentGroup?.group || ''}`}>
              <span>
                <IconButton
                  onClick={() => currentGroup && handleRefresh(currentGroup)}
                  disabled={!!refreshing}
                  sx={{ mt: 1 }}
                >
                  {refreshing === currentProvider
                    ? <CircularProgress size={20} />
                    : <Refresh />}
                </IconButton>
              </span>
            </Tooltip>
          </Box>

          {/* Ollama URL — shown only for Ollama models */}
          {isOllama && (
            <TextField
              label="URL serwera Ollama"
              value={form.ollama_url}
              onChange={e => setForm({ ...form, ollama_url: e.target.value })}
              fullWidth
              placeholder="http://localhost:11434"
              helperText="Adres lokalnego serwera Ollama (np. http://ollama:11434 w Docker)"
            />
          )}

          {/* API key — hidden for Ollama */}
          {!isOllama && (
            <TextField
              label="Klucz API"
              type={showApiKey ? 'text' : 'password'}
              value={form.llm_api_key}
              onChange={e => setForm({ ...form, llm_api_key: e.target.value })}
              fullWidth
              helperText={apiKeyHint(form.llm_model)}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowApiKey(v => !v)} edge="end">
                      {showApiKey ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          )}

          <TextField
            label="Instrukcja systemowa (system prompt)"
            multiline
            rows={5}
            value={form.system_prompt}
            onChange={e => setForm({ ...form, system_prompt: e.target.value })}
            fullWidth
            placeholder="Jesteś pomocnym asystentem hotelowym. Odpowiadaj na emaile gości w imieniu hotelu..."
            helperText={`${form.system_prompt.length}/4000 znaków`}
            inputProps={{ maxLength: 4000 }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={form.is_active}
                onChange={e => setForm({ ...form, is_active: e.target.checked })}
                color="success"
              />
            }
            label="Asystent aktywny"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowForm(false)}>Anuluj</Button>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={18} /> : <Save />}
            onClick={handleSave}
            disabled={saving}
          >
            Zapisz
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete document confirmation */}
      <Dialog open={!!docToDelete} onClose={() => setDocToDelete(null)}>
        <DialogTitle>Usuń dokument</DialogTitle>
        <DialogContent>
          <Typography>Usunąć dokument „{docToDelete?.doc.name}"?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDocToDelete(null)}>Anuluj</Button>
          <Button variant="contained" color="error" onClick={handleDeleteDoc}>Usuń</Button>
        </DialogActions>
      </Dialog>

      {/* Edit document dialog */}
      <Dialog open={!!docToEdit} onClose={() => setDocToEdit(null)} maxWidth="md" fullWidth>
        <DialogTitle>Edytuj dokument</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="Nazwa dokumentu"
            value={docEditForm.name}
            onChange={e => setDocEditForm(f => ({ ...f, name: e.target.value }))}
            fullWidth
          />
          <TextField
            label="Treść"
            multiline
            rows={16}
            value={docEditForm.content}
            onChange={e => setDocEditForm(f => ({ ...f, content: e.target.value }))}
            fullWidth
            inputProps={{ style: { fontFamily: 'monospace', fontSize: 13 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDocToEdit(null)}>Anuluj</Button>
          <Button
            variant="contained"
            startIcon={docEditSaving ? <CircularProgress size={18} /> : <Save />}
            onClick={handleSaveDocEdit}
            disabled={docEditSaving}
          >
            Zapisz
          </Button>
        </DialogActions>
      </Dialog>

      {/* Empty state */}
      {assistants.length === 0 && (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <SmartToy sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">Brak asystenta AI</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Skonfiguruj asystenta AI, aby automatycznie generować odpowiedzi na emaile gości.
            </Typography>
            <Button variant="contained" startIcon={<Add />} onClick={handleAdd}>
              Dodaj asystenta AI
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Assistant cards */}
      {assistants.map(assistant => (
        <Card key={assistant.id} sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <SmartToy color={assistant.is_active ? 'primary' : 'disabled'} />
                <Typography variant="h6" color={assistant.is_active ? 'text.primary' : 'text.disabled'}>
                  {assistant.name}
                </Typography>
                <Chip label={assistant.llm_model} size="small" variant="outlined" />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Tooltip title={assistant.is_active ? 'Wyłącz asystenta' : 'Włącz asystenta'}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={assistant.is_active}
                        onChange={() => handleToggleActive(assistant)}
                        color="success"
                        size="small"
                      />
                    }
                    label={assistant.is_active ? 'Aktywny' : 'Nieaktywny'}
                    sx={{ mr: 0 }}
                  />
                </Tooltip>
                <Button size="small" variant="outlined" onClick={() => handleEdit(assistant)}>
                  Edytuj
                </Button>
                <IconButton size="small" color="error" onClick={() => handleDelete(assistant)}>
                  <Delete fontSize="small" />
                </IconButton>
              </Box>
            </Box>

            {assistant.system_prompt && (
              <Typography variant="body2" color="text.secondary" sx={{
                mb: 1,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}>
                {assistant.system_prompt}
              </Typography>
            )}

            <Divider sx={{ my: 2 }} />

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Dokumenty wiedzy ({assistant.documents.length})
              </Typography>
              <Tooltip title="Obsługiwane formaty: TXT, MD, PDF, DOCX (max 10 MB)">
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={uploading === assistant.id ? <CircularProgress size={14} /> : <UploadFile />}
                  onClick={() => handleUploadClick(assistant.id)}
                  disabled={uploading === assistant.id}
                >
                  Dodaj dokument
                </Button>
              </Tooltip>
            </Box>

            {assistant.documents.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Brak dokumentów. Dodaj pliki, które asystent będzie uwzględniał w odpowiedziach.
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {assistant.documents.map(doc => (
                  <Box key={doc.id} sx={{
                    display: 'flex', alignItems: 'center', gap: 1,
                    px: 1, py: 0.5, borderRadius: 1,
                    border: '1px solid', borderColor: 'divider',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}>
                    <Description fontSize="small" color="action" />
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.name}
                    </Typography>
                    <Tooltip title="Edytuj treść">
                      <IconButton size="small" onClick={() => handleOpenDocEdit(assistant.id, doc)}>
                        <Edit fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Usuń dokument">
                      <IconButton size="small" color="error" onClick={() => setDocToDelete({ assistantId: assistant.id, doc })}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>
      ))}
    </>
  );
}
