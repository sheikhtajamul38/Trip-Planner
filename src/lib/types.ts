import type { QuoteDetails } from "./ai";
import type { ActivityLevel, DestinationId, HotelCategory, Interest } from "./destinations";
import type { Itinerary } from "./planner";

export type TripStatus = "PLANNED" | "QUOTES_REQUESTED" | "BOOKED" | "COMPLETED" | "CANCELLED";
export type LeadStatus = "NEW" | "ACCEPTED" | "QUOTE_SENT" | "CUSTOMER_VIEWED" | "SELECTED" | "LOST" | "EXPIRED" | "DECLINED";
export type QuoteStatus = "SENT" | "VIEWED" | "ACCEPTED" | "REJECTED" | "SUPERSEDED" | "EXPIRED";
export type BookingStatus = "PENDING_DEPOSIT" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
export type PaymentStatus = "PENDING" | "VERIFIED" | "FAILED";
export type PaymentType = "DEPOSIT" | "BALANCE" | "REFUND";
export type CommissionModel = "FREE" | "LEAD_FEE" | "SUBSCRIPTION" | "COMMISSION";

export interface UserRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: string;
  created_at: Date;
}

export interface AgencyRow {
  id: string;
  name: string;
  description: string;
  phone: string;
  email: string | null;
  verification_status: "PENDING" | "VERIFIED" | "SUSPENDED";
  verified_items: string[];
  coverage: DestinationId[];
  min_budget: number;
  max_budget: number | null;
  commission_model: CommissionModel;
  commission_rate: number;
  lead_credits: number;
  active: boolean;
  created_at: Date;
}

export interface TripRow {
  id: string;
  user_id: string | null;
  start_date: string;
  end_date: string;
  travellers: number;
  budget_min: number;
  budget_max: number | null;
  interests: Interest[];
  destinations: DestinationId[];
  hotel_category: HotelCategory;
  activity_level: ActivityLevel;
  with_kids: boolean;
  excluded: DestinationId[];
  notes: string;
  ai_itinerary: Itinerary;
  status: TripStatus;
  created_at: Date;
  updated_at: Date;
}

export interface LeadRow {
  id: string;
  trip_id: string;
  agency_id: string;
  status: LeadStatus;
  revision_note: string | null;
  credit_charged: boolean;
  created_at: Date;
  accepted_at: Date | null;
}

export interface QuoteRow {
  id: string;
  lead_id: string;
  agency_id: string;
  amount: number;
  details: QuoteDetails;
  customer_summary: string;
  valid_until: string;
  status: QuoteStatus;
  created_at: Date;
}

export interface BookingRow {
  id: string;
  trip_id: string;
  agency_id: string;
  quote_id: string;
  total_amount: number;
  deposit_amount: number;
  status: BookingStatus;
  created_at: Date;
  confirmed_at: Date | null;
  completed_at: Date | null;
}

export interface PaymentRow {
  id: string;
  booking_id: string;
  amount: number;
  payment_type: PaymentType;
  payment_status: PaymentStatus;
  payment_provider_reference: string | null;
  recorded_by: string;
  created_at: Date;
  verified_at: Date | null;
}

export interface ReviewRow {
  id: string;
  booking_id: string;
  user_id: string | null;
  agency_id: string;
  rating: number;
  comment: string;
  verified_trip: boolean;
  created_at: Date;
}

export interface IssueRow {
  id: string;
  trip_id: string;
  booking_id: string | null;
  message: string;
  status: "OPEN" | "RESOLVED";
  created_at: Date;
}

export interface NotificationRow {
  id: string;
  channel: string;
  recipient: string;
  message: string;
  link: string | null;
  status: "QUEUED" | "SENT" | "FAILED";
  created_at: Date;
  sent_at: Date | null;
}

/** Thrown for expected business-rule failures; the message is safe to show users. */
export class WorkflowError extends Error {}
