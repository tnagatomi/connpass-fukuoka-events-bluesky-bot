export type EventType = "participation" | "advertisement";

export type OpenStatus = "preopen" | "open" | "close" | "cancelled";

export type ConnpassGroup = {
  id: number;
  title: string;
  url: string;
};

export type ConnpassEvent = {
  id: number;
  title: string;
  catch: string | null;
  description: string | null;
  url: string;
  image_url: string | null;
  started_at: string | null;
  ended_at: string | null;
  address: string | null;
  place: string | null;
  group: ConnpassGroup | null;
  event_type: EventType;
  open_status: OpenStatus;
};

export type EventsResponse = {
  results_returned: number;
  results_available: number;
  results_start: number;
  events: ConnpassEvent[];
};
