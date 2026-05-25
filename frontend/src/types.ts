export type Area = {
  id: number;
  code: string;
  name: string;
  function_enabled: number | boolean;
  active: number | boolean;
};

export type OpeningHour = {
  day_of_week: number;
  opens_at: string;
  closes_at: string;
  is_closed: number | boolean;
};

export type MetaPayload = {
  areas: Area[];
  function_areas: Area[];
  settings: Record<string, string>;
  opening_hours: OpeningHour[];
};

export type User = {
  id: number;
  name: string;
  email: string;
  role: "manager" | "customer";
  status: "active" | "inactive";
  created_at?: string;
  updated_at?: string;
};

export type Booking = {
  id: number;
  booking_reference: string;
  booking_type: "table" | "function";
  status: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  guest_count: number;
  booking_date: string;
  start_time: string;
  end_time: string;
  preferred_area_id?: number | null;
  assigned_area_id?: number | null;
  preferred_area_name?: string | null;
  assigned_area_name?: string | null;
  table_numbers?: string | null;
  event_type?: string | null;
  notes?: string | null;
  manager_message?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type Paginated<T> = {
  items: T[];
  meta: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
};

export type DashboardPayload = {
  cards: {
    today_bookings: number;
    pending_functions: number;
    guests_next_7_days: number;
    emails_logged: number;
  };
  recent: Booking[];
  area_mix: Array<{ area_name: string; total: number }>;
};

export type TableRecord = {
  id: number;
  area_id: number;
  table_number: number;
  capacity: number;
  active: number | boolean;
};

export type AiLog = {
  id: number;
  booking_id: number;
  booking_reference: string;
  booking_date: string;
  start_time: string;
  customer_name: string;
  suggested_area_name?: string | null;
  suggested_table_numbers_json: string;
  final_table_numbers_json: string;
  explanation: string;
  overridden: number | boolean;
  created_at: string;
};

export type EmailLog = {
  id: number;
  booking_reference?: string | null;
  recipient_email: string;
  subject: string;
  body: string;
  status: string;
  created_at: string;
};
