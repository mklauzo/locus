import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Typography, Button, Box, Paper, IconButton, Tooltip,
  ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import { ArrowBack, ChevronLeft, ChevronRight, ViewList, GridView } from '@mui/icons-material';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import api from '../api';
import { CalendarEntry, RoomSimple } from '../types';

const CELL_WIDTH = 36;
const LABEL_WIDTH = 80;
const ROW_HEIGHT = 28;
const DAY_LABEL_WIDTH = 64;
const ROOM_COL_WIDTH = 100;

const COLORS = [
  '#1976d2', '#388e3c', '#f57c00', '#7b1fa2', '#c62828',
  '#00838f', '#4e342e', '#283593', '#558b2f', '#ad1457',
];

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type ViewMode = 'gantt' | 'matrix';

export default function CalendarPage() {
  const { hotelId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();

  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem('calendarViewMode') as ViewMode) || 'gantt',
  );
  const [month, setMonth] = useState(() => {
    const s = (location.state as any);
    return s?.initialMonth ? dayjs(s.initialMonth).startOf('month') : dayjs().startOf('month');
  });
  const [rooms, setRooms] = useState<RoomSimple[]>([]);
  const [reservations, setReservations] = useState<CalendarEntry[]>([]);

  const handleViewMode = (_: React.MouseEvent, v: ViewMode | null) => {
    if (!v) return;
    setViewMode(v);
    localStorage.setItem('calendarViewMode', v);
  };

  useEffect(() => {
    const from = month.format('YYYY-MM-DD');
    const to = month.endOf('month').format('YYYY-MM-DD');
    api.get(`/hotels/${hotelId}/calendar/?date_from=${from}&date_to=${to}`).then(r => {
      setRooms(r.data.rooms?.map((rm: any) => ({ id: rm.id, number: rm.number, capacity: rm.capacity })) || []);
      setReservations(r.data.reservations || []);
    });
  }, [hotelId, month]);

  const days = useMemo(
    () => Array.from({ length: month.daysInMonth() }, (_, i) => month.add(i, 'day')),
    [month],
  );

  const today = useMemo(() => dayjs(), []);

  const PRELIMINARY_COLOR = 'rgba(76, 175, 80, 0.35)';
  const SETTLED_COLOR = 'rgba(180, 180, 180, 0.55)';

  const colorMap = useMemo(() => {
    const map: Record<number, string> = {};
    let colorIdx = 0;
    reservations.forEach(r => {
      if (r.is_settled) {
        map[r.id] = SETTLED_COLOR;
      } else if (r.deposit_paid) {
        map[r.id] = hexToRgba(COLORS[colorIdx++ % COLORS.length], 0.72);
      } else {
        map[r.id] = PRELIMINARY_COLOR;
      }
    });
    return map;
  }, [reservations]);

  const reservationsByRoom = useMemo(() => {
    const map: Record<number, CalendarEntry[]> = {};
    reservations.forEach(r => {
      if (!map[r.room]) map[r.room] = [];
      map[r.room].push(r);
    });
    return map;
  }, [reservations]);

  const barBase = {
    borderRadius: 1, fontSize: 10, px: 0.5,
    overflow: 'hidden',
    cursor: 'pointer', '&:hover': { opacity: 0.85 },
  } as const;

  const barColor = (r: CalendarEntry) => {
    if (r.is_settled) return { color: '#555', border: '1px solid rgba(150,150,150,0.5)' };
    if (r.deposit_paid) return { color: '#fff' };
    return { color: '#1b5e20', border: '1px solid rgba(76,175,80,0.7)', fontWeight: 600 };
  };

  // ── Gantt view (rows = rooms, columns = days) ──────────────────────────────
  const renderGantt = () => (
    <Paper sx={{ overflow: 'auto' }}>
      <Box sx={{ display: 'inline-flex', flexDirection: 'column', minWidth: '100%' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', borderBottom: 1, borderColor: 'divider', position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 1 }}>
          <Box sx={{ width: LABEL_WIDTH, flexShrink: 0, p: 0.5, borderRight: 1, borderColor: 'divider', fontWeight: 600, fontSize: 12 }}>
            {t('calendar.room')}
          </Box>
          {days.map(d => {
            const isToday = d.isSame(today, 'day');
            return (
              <Box key={d.date()} sx={{
                width: CELL_WIDTH, flexShrink: 0, textAlign: 'center', p: 0.5,
                borderRight: 1, borderColor: 'divider', fontSize: 11,
                bgcolor: isToday ? 'rgba(255, 152, 0, 0.18)' : (d.day() === 0 || d.day() === 6 ? 'action.hover' : 'transparent'),
              }}>
                <Box sx={{ fontWeight: isToday ? 700 : 'normal', color: isToday ? '#e65100' : 'inherit' }}>{d.date()}</Box>
                <Box sx={{ fontSize: 9, opacity: 0.6 }}>{d.locale(i18n.language).format('dd')}</Box>
              </Box>
            );
          })}
        </Box>

        {/* Room rows */}
        {rooms.map(room => (
          <Box key={room.id} sx={{ display: 'flex', borderBottom: 1, borderColor: 'divider', position: 'relative', height: 32 }}>
            <Box sx={{
              width: LABEL_WIDTH, flexShrink: 0, p: 0.5, borderRight: 1, borderColor: 'divider',
              fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center',
            }}>
              {room.number}
            </Box>
            <Box sx={{ position: 'relative', display: 'flex', flex: 1 }}>
              {days.map(d => (
                <Box key={d.date()} sx={{
                  width: CELL_WIDTH, flexShrink: 0, borderRight: 1, borderColor: 'divider',
                  bgcolor: d.isSame(today, 'day') ? 'rgba(255, 152, 0, 0.12)' : (d.day() === 0 || d.day() === 6 ? 'action.hover' : 'transparent'),
                }} />
              ))}
              {(reservationsByRoom[room.id] || []).map(r => {
                const start = dayjs(r.check_in);
                const end = dayjs(r.check_out);
                const monthStart = month;
                const monthEnd = month.endOf('month');
                const isCheckInClamped = start.isBefore(monthStart);
                const isCheckOutClamped = end.isAfter(monthEnd);
                const barStart = isCheckInClamped ? monthStart : start;
                const barEnd = isCheckOutClamped ? monthEnd.add(1, 'day') : end;
                const startOffset = barStart.diff(monthStart, 'day');
                const endOffset = barEnd.diff(monthStart, 'day');
                if (endOffset - startOffset < 0) return null;
                const half = CELL_WIDTH / 2;
                const leftPx = startOffset * CELL_WIDTH + (isCheckInClamped ? 0 : half);
                const rightPx = endOffset * CELL_WIDTH + (isCheckOutClamped ? 0 : half);
                const widthPx = rightPx - leftPx - 2;
                if (widthPx <= 0) return null;
                return (
                  <Tooltip key={r.id} title={`${r.guest_name} (${r.check_in} → ${r.check_out})`}>
                    <Box
                      onClick={() => navigate(`/hotels/${hotelId}/reservations/${r.id}`)}
                      sx={{
                        ...barBase,
                        ...barColor(r),
                        position: 'absolute', left: leftPx, width: widthPx,
                        top: 4, height: 24,
                        bgcolor: colorMap[r.id],
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.guest_name}
                      </Box>
                      {!r.deposit_paid && (
                        <Box component="span" sx={{ flexShrink: 0, fontWeight: 700, fontSize: 11, lineHeight: 1, ml: 0.25 }}>?</Box>
                      )}
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>
          </Box>
        ))}
      </Box>
    </Paper>
  );

  // ── Matrix view (rows = days, columns = rooms) — vertical bars ─────────────
  const renderMatrix = () => {
    const half = ROW_HEIGHT / 2;
    const monthStart = month;
    const monthEnd = month.endOf('month');

    return (
      <Paper sx={{ overflow: 'auto' }}>
        <Box sx={{ display: 'inline-flex', flexDirection: 'column', minWidth: '100%' }}>
          {/* Sticky header: room names */}
          <Box sx={{ display: 'flex', borderBottom: 1, borderColor: 'divider', position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 1 }}>
            <Box sx={{ width: DAY_LABEL_WIDTH, flexShrink: 0, p: 0.5, borderRight: 1, borderColor: 'divider', fontWeight: 600, fontSize: 12 }}>
              {t('calendar.day')}
            </Box>
            {rooms.map(room => (
              <Box key={room.id} sx={{
                width: ROOM_COL_WIDTH, flexShrink: 0, textAlign: 'center', p: 0.5,
                borderRight: 1, borderColor: 'divider', fontSize: 12, fontWeight: 600,
              }}>
                {room.number}
              </Box>
            ))}
          </Box>

          {/* Body: day labels + room columns with vertical bars */}
          <Box sx={{ display: 'flex' }}>
            {/* Day labels */}
            <Box sx={{ width: DAY_LABEL_WIDTH, flexShrink: 0 }}>
              {days.map(d => {
                const isToday = d.isSame(today, 'day');
                return (
                  <Box key={d.date()} sx={{
                    height: ROW_HEIGHT, borderBottom: 1, borderRight: 1, borderColor: 'divider',
                    bgcolor: isToday ? 'rgba(255, 152, 0, 0.18)' : (d.day() === 0 || d.day() === 6 ? 'action.hover' : 'transparent'),
                    display: 'flex', alignItems: 'center', px: 0.75, gap: 0.5, fontSize: 11,
                  }}>
                    <Box sx={{ fontWeight: 700, color: isToday ? '#e65100' : 'inherit' }}>{d.date()}</Box>
                    <Box sx={{ fontSize: 9, opacity: 0.6 }}>{d.locale(i18n.language).format('dd')}</Box>
                  </Box>
                );
              })}
            </Box>

            {/* One column per room */}
            {rooms.map(room => (
              <Box key={room.id} sx={{
                width: ROOM_COL_WIDTH, flexShrink: 0, borderRight: 1, borderColor: 'divider',
                position: 'relative',
              }}>
                {/* Background day grid */}
                {days.map(d => (
                  <Box key={d.date()} sx={{
                    height: ROW_HEIGHT, borderBottom: 1, borderColor: 'divider',
                    bgcolor: d.isSame(today, 'day') ? 'rgba(255, 152, 0, 0.12)' : (d.day() === 0 || d.day() === 6 ? 'action.hover' : 'transparent'),
                  }} />
                ))}

                {/* Vertical reservation bars */}
                {(reservationsByRoom[room.id] || []).map(r => {
                  const start = dayjs(r.check_in);
                  const end = dayjs(r.check_out);
                  const isCheckInClamped = start.isBefore(monthStart);
                  const isCheckOutClamped = end.isAfter(monthEnd);
                  const barStart = isCheckInClamped ? monthStart : start;
                  const barEnd = isCheckOutClamped ? monthEnd.add(1, 'day') : end;
                  const startOffset = barStart.diff(monthStart, 'day');
                  const endOffset = barEnd.diff(monthStart, 'day');
                  if (endOffset - startOffset < 0) return null;
                  const topPx = startOffset * ROW_HEIGHT + (isCheckInClamped ? 0 : half);
                  const bottomPx = endOffset * ROW_HEIGHT + (isCheckOutClamped ? 0 : half);
                  const heightPx = bottomPx - topPx - 2;
                  if (heightPx <= 0) return null;
                  return (
                    <Tooltip key={r.id} title={`${r.guest_name} (${r.check_in} → ${r.check_out})`}>
                      <Box
                        onClick={() => navigate(`/hotels/${hotelId}/reservations/${r.id}`)}
                        sx={{
                          ...barBase,
                          ...barColor(r),
                          position: 'absolute',
                          top: topPx, left: 4, right: 4, height: heightPx,
                          bgcolor: colorMap[r.id],
                          display: 'flex', alignItems: 'flex-start', pt: 0.5,
                        }}
                      >
                        <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.guest_name}
                        </Box>
                        {!r.deposit_paid && (
                          <Box component="span" sx={{ flexShrink: 0, fontWeight: 700, fontSize: 11, lineHeight: 1, ml: 0.25 }}>?</Box>
                        )}
                      </Box>
                    </Tooltip>
                  );
                })}
              </Box>
            ))}
          </Box>
        </Box>
      </Paper>
    );
  };

  return (
    <>
      <Button startIcon={<ArrowBack />} onClick={() => navigate(`/hotels/${hotelId}`)} sx={{ mb: 2 }}>
        {t('calendar.back')}
      </Button>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <IconButton onClick={() => setMonth(m => m.subtract(1, 'month'))}><ChevronLeft /></IconButton>
        <Typography variant="h6" sx={{ minWidth: 200, textAlign: 'center' }}>
          {month.locale(i18n.language).format('MMMM YYYY')}
        </Typography>
        <IconButton onClick={() => setMonth(m => m.add(1, 'month'))}><ChevronRight /></IconButton>

        <Box sx={{ flexGrow: 1 }} />

        <ToggleButtonGroup value={viewMode} exclusive onChange={handleViewMode} size="small">
          <ToggleButton value="gantt" title={t('calendar.ganttTitle')}>
            <ViewList fontSize="small" />
          </ToggleButton>
          <ToggleButton value="matrix" title={t('calendar.matrixTitle')}>
            <GridView fontSize="small" />
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {viewMode === 'gantt' ? renderGantt() : renderMatrix()}
    </>
  );
}
