export type Area = {
  id: number;
  code: string;
  name: string;
  table_start?: number;
  table_end?: number;
  function_enabled: number | boolean;
  active: number | boolean;
  sort_order?: number;
};

export type OpeningHour = {
  day_of_week: number;
  opens_at: string;
  closes_at: string;
  is_closed: number | boolean;
};

export type OnlineBookingBlock = {
  block_date: string;
  created_by_user_id?: number | null;
  created_at?: string;
  updated_at?: string;
};

export type MetaPayload = {
  areas: Area[];
  function_areas: Area[];
  settings: Record<string, string>;
  opening_hours: OpeningHour[];
  online_booking_blocks?: OnlineBookingBlock[];
};

export type User = {
  id: number;
  name: string;
  email: string;
  role: "manager" | "customer";
  status: "active" | "inactive";
  avatar_url?: string | null;
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
  assigned_area_ids?: string | null;
  preferred_area_name?: string | null;
  assigned_area_name?: string | null;
  assigned_area_names?: string | null;
  table_ids?: string | null;
  table_numbers?: string | null;
  event_type?: string | null;
  notes?: string | null;
  staff_notes?: string | null;
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
  today: Record<
    "all" | "lunch" | "dinner",
    {
      bookings: number;
      guests: number;
    }
  >;
  pending_actions: {
    function_requests: number;
    bookings_without_tables: number;
  };
  guest_chart: {
    weekly: Array<{ date: string; guests: number }>;
    monthly: Array<{ date: string; guests: number }>;
  };
  today_bookings: Booking[];
  upcoming_functions: Booking[];
  cards: {
    today_bookings: number;
    pending_functions: number;
    guests_next_7_days: number;
    emails_logged: number;
  };
  recent: Booking[];
  area_mix: Array<{ area_name: string; total: number }>;
  status_mix: Array<{ status: string; total: number }>;
  upcoming: Booking[];
  activity: ActivityLog[];
};

export type TableRecord = {
  id: number;
  area_id: number;
  table_number: number;
  capacity: number;
  active: number | boolean;
};

export type ActivityLog = {
  id: number;
  user_id?: number | null;
  user_name?: string | null;
  action: string;
  entity_type: string;
  entity_id?: number | null;
  details_json?: string | null;
  created_at: string;
};
