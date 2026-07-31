// A committed, fully-resolved date range (unlike react-day-picker's own
// DateRange, whose `to` is optional while the user is mid-selection).
export interface DateRange {
  from: Date;
  to: Date;
}

export type ViewKey = "timer" | "reports" | "projects" | "members";
