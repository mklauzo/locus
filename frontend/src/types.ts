export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: 'ADMIN' | 'USER';
  is_blocked: boolean;
  is_trashed: boolean;
  created_at: string;
}

export interface Hotel {
  id: number;
  name: string;
  address: string;
  email: string;
  imap_host: string;
  imap_port: number;
  imap_ssl: boolean;
  imap_login: string;
  rooms: RoomSimple[];
  users: { id: number; username: string }[];
  created_at: string;
}

export interface RoomSimple {
  id: number;
  number: string;
  capacity: number;
}

export interface Room {
  id: number;
  hotel: number;
  number: string;
  capacity: number;
  is_deleted: boolean;
  created_at: string;
}

export interface MailCorrespondence {
  id: number;
  date: string;
  subject: string;
  body: string;
  message_id: string;
}

export interface AuditLogEntry {
  id: number;
  user: number;
  user_name: string;
  action: string;
  changes: Record<string, { old: string; new: string }>;
  created_at: string;
}

export interface Reservation {
  id: number;
  hotel: number;
  room: number;
  room_number: string;
  guest_first_name: string;
  guest_last_name: string;
  guest_name: string;
  companions: number;
  animals: number;
  check_in: string;
  check_out: string;
  days_count: number;
  deposit_paid: boolean;
  deposit_amount: string;
  deposit_date: string | null;
  remaining_amount: string;
  notes: string;
  contact_email: string;
  contact_phone: string;
  is_settled: boolean;
  is_deleted: boolean;
  correspondence: MailCorrespondence[];
  audit_logs: AuditLogEntry[];
  created_at: string;
  updated_at: string;
}

export interface CalendarEntry {
  id: number;
  room: number;
  room_number: string;
  room_capacity: number;
  guest_first_name: string;
  guest_last_name: string;
  guest_name: string;
  check_in: string;
  check_out: string;
  companions: number;
}

export interface WeatherData {
  temp: number;
  description: string;
  icon: string;
}
