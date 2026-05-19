import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar as CalendarIcon, ChevronLeft, ChevronRight, MapPin, Clock, Briefcase, Navigation } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, parseISO, isToday, startOfWeek, endOfWeek, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface CalendarEvent {
  id: number;
  scheduleDateId?: number;
  title: string;
  date: string;
  time: string | null;
  endTime?: string | null;
  notes?: string | null;
  address: string | null;
  contactName: string | null;
  stage: string | null;
}

function formatTime(time: string | null): string {
  if (!time) return "";
  try {
    const [h, m] = time.split(":");
    const hour = parseInt(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${m} ${ampm}`;
  } catch {
    return time;
  }
}

function openDirections(address: string) {
  const encoded = encodeURIComponent(address);
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, "_blank");
}

function EventCard({ event }: { event: CalendarEvent }) {
  return (
    <Card className="hover-elevate" data-testid={`card-calendar-event-${event.id}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link href={`/my-jobs`}>
              <span className="text-sm font-medium hover:underline cursor-pointer" data-testid={`link-event-title-${event.id}`}>
                {event.title}
              </span>
            </Link>
            {event.contactName && (
              <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-event-contact-${event.id}`}>
                {event.contactName}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
          {event.time && (
            <span className="flex items-center gap-1" data-testid={`text-event-time-${event.id}`}>
              <Clock className="w-3 h-3" />
              {formatTime(event.time)}{event.endTime ? ` – ${formatTime(event.endTime)}` : ""}
            </span>
          )}
          {event.address && (
            <span className="flex items-center gap-1 min-w-0 truncate" data-testid={`text-event-address-${event.id}`}>
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{event.address}</span>
            </span>
          )}
        </div>
        {event.notes && (
          <p className="text-xs text-muted-foreground italic" data-testid={`text-event-notes-${event.id}`}>
            {event.notes}
          </p>
        )}

        {event.address && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => openDirections(event.address!)}
            data-testid={`button-directions-${event.id}`}
          >
            <Navigation className="w-3.5 h-3.5 mr-1.5" />
            Get Directions
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function MonthCalendarGrid({
  currentMonth,
  selectedDate,
  onSelectDate,
  eventsByDate,
}: {
  currentMonth: Date;
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  eventsByDate: Record<string, CalendarEvent[]>;
}) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {weekDays.map(d => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden">
        {days.map(day => {
          const key = format(day, "yyyy-MM-dd");
          const events = eventsByDate[key] || [];
          const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
          const isSelected = isSameDay(day, selectedDate);
          const today = isToday(day);

          return (
            <button
              key={key}
              onClick={() => onSelectDate(day)}
              className={cn(
                "flex flex-col items-center py-2 px-1 min-h-[3rem] transition-colors bg-background",
                !isCurrentMonth && "opacity-40",
                isSelected && "ring-2 ring-primary ring-inset",
                today && !isSelected && "bg-primary/5"
              )}
              data-testid={`button-calendar-day-${key}`}
            >
              <span className={cn(
                "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
                today && "bg-primary text-primary-foreground",
              )}>
                {format(day, "d")}
              </span>
              {events.length > 0 && (
                <div className="flex gap-0.5 mt-1 flex-wrap justify-center">
                  {events.slice(0, 3).map((ev, i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-primary"
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({
  selectedDate,
  eventsByDate,
  onSelectDate,
  onNavigateWeek,
}: {
  selectedDate: Date;
  eventsByDate: Record<string, CalendarEvent[]>;
  onSelectDate: (d: Date) => void;
  onNavigateWeek: (dir: number) => void;
}) {
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="icon" onClick={() => onNavigateWeek(-1)} data-testid="button-prev-week">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-medium" data-testid="text-week-range">
          {format(weekDays[0], "MMM d")} - {format(weekDays[6], "MMM d, yyyy")}
        </span>
        <Button variant="outline" size="icon" onClick={() => onNavigateWeek(1)} data-testid="button-next-week">
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-2">
        {weekDays.map(day => {
          const key = format(day, "yyyy-MM-dd");
          const events = eventsByDate[key] || [];
          const today = isToday(day);
          const isSelected = isSameDay(day, selectedDate);

          return (
            <div key={key} data-testid={`week-day-${key}`}>
              <button
                onClick={() => onSelectDate(day)}
                className={cn(
                  "flex items-center gap-2 w-full text-left py-1.5 px-2 rounded-md transition-colors",
                  isSelected && "bg-primary/10",
                  today && !isSelected && "bg-muted/50"
                )}
                data-testid={`button-week-day-${key}`}
              >
                <span className={cn(
                  "text-xs font-medium w-8 h-8 flex items-center justify-center rounded-full shrink-0",
                  today && "bg-primary text-primary-foreground"
                )}>
                  {format(day, "d")}
                </span>
                <span className="text-xs text-muted-foreground">{format(day, "EEE")}</span>
                {events.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] ml-auto">
                    {events.length} job{events.length !== 1 ? "s" : ""}
                  </Badge>
                )}
              </button>
              {events.length > 0 && isSelected && (
                <div className="pl-12 space-y-2 mt-2 mb-2">
                  {events.map(ev => (
                    <EventCard key={ev.id} event={ev} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MyCalendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"month" | "week">("month");

  const { data: events = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/my-calendar"],
  });

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach(ev => {
      if (!ev.date) return;
      const key = format(parseISO(ev.date as string), "yyyy-MM-dd");
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    });
    Object.values(map).forEach(arr => {
      arr.sort((a, b) => {
        if (!a.time && !b.time) return 0;
        if (!a.time) return 1;
        if (!b.time) return -1;
        return a.time.localeCompare(b.time);
      });
    });
    return map;
  }, [events]);

  const selectedDateKey = format(selectedDate, "yyyy-MM-dd");
  const selectedEvents = eventsByDate[selectedDateKey] || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4" data-testid="my-calendar-page">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5" />
          <h1 className="text-xl font-bold" data-testid="text-my-calendar-title">My Calendar</h1>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={viewMode === "month" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("month")}
            data-testid="button-view-month"
          >
            Month
          </Button>
          <Button
            variant={viewMode === "week" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("week")}
            data-testid="button-view-week"
          >
            Week
          </Button>
        </div>
      </div>

      {viewMode === "month" && (
        <>
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(m => subMonths(m, 1))} data-testid="button-prev-month">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-semibold" data-testid="text-current-month">
              {format(currentMonth, "MMMM yyyy")}
            </span>
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(m => addMonths(m, 1))} data-testid="button-next-month">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <MonthCalendarGrid
            currentMonth={currentMonth}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            eventsByDate={eventsByDate}
          />

          <div className="space-y-2">
            <h2 className="text-sm font-medium" data-testid="text-selected-date">
              {format(selectedDate, "EEEE, MMMM d, yyyy")}
            </h2>
            {selectedEvents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="text-no-events">
                <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No jobs scheduled for this day</p>
              </div>
            ) : (
              <div className="space-y-2" data-testid="events-list">
                {selectedEvents.map(ev => (
                  <EventCard key={ev.id} event={ev} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {viewMode === "week" && (
        <WeekView
          selectedDate={selectedDate}
          eventsByDate={eventsByDate}
          onSelectDate={setSelectedDate}
          onNavigateWeek={(dir) => setSelectedDate(d => addDays(d, dir * 7))}
        />
      )}

      {events.length === 0 && !isLoading && (
        <div className="text-center py-12 text-muted-foreground" data-testid="text-no-assignments">
          <CalendarIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No scheduled jobs</p>
          <p className="text-xs mt-1">Jobs assigned to you will appear here when scheduled</p>
        </div>
      )}
    </div>
  );
}
