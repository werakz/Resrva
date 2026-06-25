export type Area = {
  id: number;
  venue_id?: number;
  code: string;
  name: string;
  table_start?: number;
  table_end?: number;
  function_enabled: number | boolean;
  auto_assign_enabled?: number | boolean;
  allow_table_joins?: number | boolean;
  max_joined_tables?: number | null;
  assignment_priority?: number;
  preferred_min_guests?: number | null;
  preferred_max_guests?: number | null;
  active: number | boolean;
  sort_order?: number;
};

export type Venue = {
  id: number;
  account_id: number;
  account_name?: string;
  name: string;
  slug: string;
  timezone: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  active?: number | boolean;
  access_role?: "owner" | "manager" | "staff" | string;
  created_at?: string;
  updated_at?: string;
};

export type Account = {
  id: number;
  business_name: string;
  plan: string;
  billing_status: string;
  venue_count?: number;
  active_venue_count?: number;
  created_at?: string;
  updated_at?: string;
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

export type BookingCustomField = {
  id: number;
  booking_type_id: number;
  label: string;
  field_type: "text" | "dropdown" | "checkbox" | "number";
  is_required: number | boolean;
  options?: string[];
  options_json?: string | null;
  display_order: number;
};

export type BookingTypeSchedule = {
  id?: number;
  booking_type_id?: number;
  recurrence_type: "none" | "daily" | "weekly" | "fortnightly" | "monthly" | "custom";
  day_of_week?: number | null;
  day_of_weeks?: number[];
  day_of_month?: number | null;
  custom_dates?: string[];
  custom_dates_json?: string | null;
  reserved_area_ids?: number[];
  reserved_area_ids_json?: string | null;
  reserved_area_names?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  arrival_time?: string | null;
  duration_minutes: number;
  start_date?: string | null;
  end_date?: string | null;
};

export type BookingSession = {
  id: number;
  booking_type_id: number;
  date: string;
  start_time: string;
  end_time: string;
  arrival_time?: string | null;
  capacity?: number | null;
  booking_limit?: number | null;
  reserved_area_ids?: number[];
  reserved_area_ids_json?: string | null;
  reserved_area_names?: string | null;
  status: "active" | "cancelled";
  booked_guests?: number;
  booked_count?: number;
  available_guests?: number | null;
  available_bookings?: number | null;
};

export type BookingType = {
  id: number;
  venue_id?: number;
  name: string;
  slug: string;
  category: "dining" | "event" | "function" | "custom";
  description?: string | null;
  customer_button_label?: string | null;
  internal_label?: string | null;
  is_active: number | boolean;
  display_to_customers: number | boolean;
  colour: string;
  icon: string;
  capacity_mode: "guests" | "bookings" | "tables" | "area";
  min_guests: number;
  max_guests?: number | null;
  max_capacity?: number | null;
  max_bookings?: number | null;
  requires_approval: number | boolean;
  auto_confirm: number | boolean;
  allow_waitlist: number | boolean;
  booking_cutoff_minutes: number;
  booking_window_days: number;
  cancellation_cutoff_minutes: number;
  sort_order: number;
  schedule?: BookingTypeSchedule | null;
  custom_fields: BookingCustomField[];
  upcoming_sessions?: BookingSession[];
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type MetaPayload = {
  venue?: Venue | null;
  areas: Area[];
  function_areas: Area[];
  settings: Record<string, string>;
  opening_hours: OpeningHour[];
  online_booking_blocks?: OnlineBookingBlock[];
  booking_types?: BookingType[];
};

export type User = {
  id: number;
  name: string;
  email: string;
  role: "manager" | "customer";
  status: "active" | "inactive";
  avatar_url?: string | null;
  is_platform_admin?: number | boolean;
  created_at?: string;
  updated_at?: string;
  venue_role?: string;
  has_access?: number | boolean;
};

export type Booking = {
  id: number;
  booking_reference: string;
  booking_type: "table" | "function" | "event";
  booking_type_id?: number | null;
  booking_session_id?: number | null;
  booking_type_name?: string | null;
  booking_type_category?: string | null;
  booking_type_colour?: string | null;
  booking_type_icon?: string | null;
  booking_session_date?: string | null;
  booking_session_arrival_time?: string | null;
  event_reserved_area_ids?: string | null;
  event_reserved_area_names?: string | null;
  event_reserved_area_ids_json?: string | null;
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
  table_marked?: number | boolean | null;
  event_type?: string | null;
  custom_answers_summary?: string | null;
  notes?: string | null;
  staff_notes?: string | null;
  staff_name?: string | null;
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
  auto_assign_enabled?: number | boolean;
  joinable?: number | boolean;
  assignment_priority?: number;
  preferred_min_guests?: number | null;
  preferred_max_guests?: number | null;
  keep_for_walkins?: number | boolean;
  accessibility_friendly?: number | boolean;
};

export type TableJoinGroup = {
  id: number;
  area_id: number;
  name: string;
  max_tables?: number | null;
  active: number | boolean;
  priority: number;
  table_ids: number[];
  table_numbers: number[];
  created_at?: string;
  updated_at?: string;
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
