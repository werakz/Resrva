import {
  Beer,
  CakeSlice,
  Calendar,
  CalendarDays,
  Clapperboard,
  Coffee,
  Dices,
  Gamepad2,
  GlassWater,
  HandPlatter,
  HelpCircle,
  Mic,
  Moon,
  Music,
  PartyPopper,
  Sparkles,
  Sun,
  Table2,
  Ticket,
  Trophy,
  Tv,
  Users,
  Utensils,
  Wine,
  type LucideIcon,
} from "lucide-react";

export const bookingIconOptions: Array<{ value: string; label: string; Icon: LucideIcon }> = [
  { value: "calendar", label: "Event", Icon: Calendar },
  { value: "calendar-days", label: "Calendar", Icon: CalendarDays },
  { value: "utensils", label: "Dining", Icon: Utensils },
  { value: "sun", label: "Lunch", Icon: Sun },
  { value: "moon", label: "Dinner", Icon: Moon },
  { value: "wine", label: "Function", Icon: Wine },
  { value: "help-circle", label: "Trivia", Icon: HelpCircle },
  { value: "mic", label: "Mic", Icon: Mic },
  { value: "music", label: "Music", Icon: Music },
  { value: "ticket", label: "Ticket", Icon: Ticket },
  { value: "users", label: "Group", Icon: Users },
  { value: "party-popper", label: "Party", Icon: PartyPopper },
  { value: "trophy", label: "Competition", Icon: Trophy },
  { value: "dices", label: "Games", Icon: Dices },
  { value: "gamepad-2", label: "Arcade", Icon: Gamepad2 },
  { value: "beer", label: "Beer", Icon: Beer },
  { value: "coffee", label: "Cafe", Icon: Coffee },
  { value: "cake-slice", label: "Celebration", Icon: CakeSlice },
  { value: "tv", label: "Screening", Icon: Tv },
  { value: "clapperboard", label: "Comedy", Icon: Clapperboard },
  { value: "sparkles", label: "Special", Icon: Sparkles },
  { value: "table-2", label: "Tables", Icon: Table2 },
  { value: "glass-water", label: "Drinks", Icon: GlassWater },
  { value: "hand-platter", label: "Service", Icon: HandPlatter },
];

const bookingIconMap = bookingIconOptions.reduce<Record<string, LucideIcon>>((map, option) => {
  map[option.value] = option.Icon;
  return map;
}, {});

export function getBookingIcon(icon?: string | null, fallback: LucideIcon = Calendar): LucideIcon {
  return bookingIconMap[icon || ""] || fallback;
}
