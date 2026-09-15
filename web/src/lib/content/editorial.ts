import { CONTENT_PILLARS, type ContentPillar } from '../config';

export type ContentType = 'tecnico' | 'actualidad';

const MADRID_TIME_ZONE = 'Europe/Madrid';
const TECHNICAL_WEEKDAYS = new Set([0, 1, 3, 5]);

function madridDateParts(date: Date): { year: number; month: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MADRID_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value || '';
  const weekday = value('weekday');
  const weekdayNumber = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);

  if (weekdayNumber < 0) throw new Error(`No se pudo determinar el día de la semana: ${weekday}`);

  return { year: Number(value('year')), month: Number(value('month')), day: Number(value('day')), weekday: weekdayNumber };
}

export function getContentTypeForDate(date: Date = new Date()): ContentType {
  return TECHNICAL_WEEKDAYS.has(madridDateParts(date).weekday) ? 'tecnico' : 'actualidad';
}

export function getTechnicalPillarForDate(date: Date = new Date()): ContentPillar {
  const { year, month, day } = madridDateParts(date);
  const currentDay = Date.UTC(year, month - 1, day);
  const firstDay = Date.UTC(year, 0, 1);
  let technicalDays = 0;

  for (let timestamp = firstDay; timestamp <= currentDay; timestamp += 86_400_000) {
    if (TECHNICAL_WEEKDAYS.has(new Date(timestamp).getUTCDay())) technicalDays++;
  }

  return CONTENT_PILLARS[(technicalDays - 1) % CONTENT_PILLARS.length];
}