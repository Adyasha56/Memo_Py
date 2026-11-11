import { prisma } from "@/lib/prisma";

// Asia/Kolkata has a fixed UTC+5:30 offset with no DST, so a constant offset is correct and
// avoids needing a timezone library. Revisit this if the configured timezone ever changes to
// one that observes DST.
const LOCAL_OFFSET_MINUTES = 330;
const MAX_TEMPORAL_MESSAGES = 30;

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function toLocal(date: Date): Date {
  return new Date(date.getTime() + LOCAL_OFFSET_MINUTES * 60000);
}

function localMidnightUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 0, 0, 0) - LOCAL_OFFSET_MINUTES * 60000);
}

function startOfLocalDay(date: Date): Date {
  const local = toLocal(date);
  return localMidnightUtc(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
}

function startOfLocalMonth(date: Date): Date {
  const local = toLocal(date);
  return localMidnightUtc(local.getUTCFullYear(), local.getUTCMonth(), 1);
}

function startOfPreviousLocalMonth(date: Date): Date {
  const local = toLocal(date);
  const month = local.getUTCMonth();
  const year = local.getUTCFullYear();
  return month === 0 ? localMidnightUtc(year - 1, 11, 1) : localMidnightUtc(year, month - 1, 1);
}

function localDayOfWeek(date: Date): number {
  return toLocal(date).getUTCDay();
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

export type TemporalRange = { start: Date; end: Date; label: string };

export function detectTemporalRange(query: string, now: Date = new Date()): TemporalRange | null {
  const text = query.toLowerCase();

  if (/\btoday\b/.test(text)) {
    return { start: startOfLocalDay(now), end: now, label: "today" };
  }

  if (/\byesterday\b/.test(text)) {
    return { start: startOfLocalDay(addDays(now, -1)), end: startOfLocalDay(now), label: "yesterday" };
  }

  const lastNDaysMatch = text.match(/\b(?:last|past)\s+(\d{1,2})\s+days?\b/);
  if (lastNDaysMatch) {
    const n = parseInt(lastNDaysMatch[1], 10);
    return { start: startOfLocalDay(addDays(now, -n)), end: now, label: `the last ${n} days` };
  }

  if (/\blast week\b/.test(text)) {
    return { start: startOfLocalDay(addDays(now, -7)), end: now, label: "the last week" };
  }

  if (/\bearlier this month\b/.test(text)) {
    return { start: startOfLocalMonth(now), end: now, label: "earlier this month" };
  }

  if (/\blast month\b/.test(text)) {
    return { start: startOfPreviousLocalMonth(now), end: startOfLocalMonth(now), label: "last month" };
  }

  for (let targetIdx = 0; targetIdx < WEEKDAYS.length; targetIdx++) {
    const name = WEEKDAYS[targetIdx];
    const match = text.match(new RegExp(`\\b(last\\s+)?${name}\\b`));
    if (match) {
      const explicitLast = Boolean(match[1]);
      const todayIdx = localDayOfWeek(now);
      let diff = (todayIdx - targetIdx + 7) % 7;
      if (diff === 0 && explicitLast) diff = 7;
      const start = startOfLocalDay(addDays(now, -diff));
      return { start, end: addDays(start, 1), label: name };
    }
  }

  return null;
}

export type TemporalMessage = {
  role: string;
  content: string;
  createdAt: Date;
  conversationTitle: string;
};

export async function retrieveMessagesInRange(range: TemporalRange): Promise<TemporalMessage[]> {
  const messages = await prisma.message.findMany({
    where: { createdAt: { gte: range.start, lt: range.end } },
    orderBy: { createdAt: "asc" },
    take: MAX_TEMPORAL_MESSAGES,
    select: {
      role: true,
      content: true,
      createdAt: true,
      conversation: { select: { title: true } },
    },
  });

  return messages.map((m) => ({
    role: m.role,
    content: m.content,
    createdAt: m.createdAt,
    conversationTitle: m.conversation.title,
  }));
}

function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export async function getTemporalContext(query: string, now: Date = new Date()): Promise<string | null> {
  try {
    const range = detectTemporalRange(query, now);
    if (!range) return null;

    const messages = await retrieveMessagesInRange(range);
    if (!messages.length) {
      return `No conversation history was found from ${range.label}.`;
    }

    const lines = messages.map(
      (m) => `[${formatTimestamp(m.createdAt)}] ${m.role === "user" ? "User" : "Assistant"}: ${m.content}`
    );
    return `Conversation history from ${range.label}:\n${lines.join("\n")}`;
  } catch (err) {
    console.error("Temporal retrieval failed (continuing without temporal context):", err);
    return null;
  }
}
