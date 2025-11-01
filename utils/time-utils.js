import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(duration);
dayjs.extend(relativeTime);

export const formatStr = {
  dateTime: 'DD MMM YYYY h:mm a',
  date: 'DD MMM YYYY',
  time: 'h:mm a',
  split: {
    dateTime: 'DD/MM/YYYY h:mm a',
    date: 'DD/MM/YYYY',
  },
  paramCase: {
    dateTime: 'DD-MM-YYYY h:mm a',
    date: 'DD-MM-YYYY',
  },
};

export function today(format) {
  return dayjs(new Date()).startOf('day').format(format);
}

export function fDateTime(date, format) {
  if (!date) return null;
  const isValid = dayjs(date).isValid();
  return isValid ? dayjs(date).format(format ?? formatStr.dateTime) : 'Invalid time value';
}

export function fDate(date, format) {
  if (!date) return null;
  const isValid = dayjs(date).isValid();
  return isValid ? dayjs(date).format(format ?? formatStr.date) : 'Invalid time value';
}

export function fTime(date, format) {
  if (!date) return null;
  const isValid = dayjs(date).isValid();
  return isValid ? dayjs(date).format(format ?? formatStr.time) : 'Invalid time value';
}

export function fTimestamp(date) {
  if (!date) return null;
  const isValid = dayjs(date).isValid();
  return isValid ? dayjs(date).valueOf() : 'Invalid time value';
}

export function fToNow(date) {
  if (!date) return null;
  const isValid = dayjs(date).isValid();
  return isValid ? dayjs(date).toNow(true) : 'Invalid time value';
}

export function fIsBetween(inputDate, startDate, endDate) {
  if (!inputDate || !startDate || !endDate) return false;
  const formattedInputDate = fTimestamp(inputDate);
  const formattedStartDate = fTimestamp(startDate);
  const formattedEndDate = fTimestamp(endDate);
  if (formattedInputDate && formattedStartDate && formattedEndDate) {
    return formattedInputDate >= formattedStartDate && formattedInputDate <= formattedEndDate;
  }
  return false;
}

export function fIsAfter(startDate, endDate) {
  return dayjs(startDate).isAfter(endDate);
}

export function fIsSame(startDate, endDate, units) {
  if (!startDate || !endDate) return false;
  const isValid = dayjs(startDate).isValid() && dayjs(endDate).isValid();
  if (!isValid) return 'Invalid time value';
  return dayjs(startDate).isSame(endDate, units ?? 'year');
}

export function fDateRangeShortLabel(startDate, endDate, initial) {
  const isValid = dayjs(startDate).isValid() && dayjs(endDate).isValid();
  const isAfter = fIsAfter(startDate, endDate);
  if (!isValid || isAfter) return 'N/A';
  let label = `${fDate(startDate)} - ${fDate(endDate)}`;
  if (initial) return label;
  const isSameYear = fIsSame(startDate, endDate, 'year');
  const isSameMonth = fIsSame(startDate, endDate, 'month');
  const isSameDay = fIsSame(startDate, endDate, 'day');
  if (isSameYear && !isSameMonth) {
    label = `${fDate(startDate, 'DD MMM')} - ${fDate(endDate)}`;
  } else if (isSameYear && isSameMonth && !isSameDay) {
    label = `${fDate(startDate, 'DD')} - ${fDate(endDate)}`;
  } else if (isSameYear && isSameMonth && isSameDay) {
    label = `${fDate(endDate)}`;
  }
  return label;
}

export function fAdd({
  years = 0,
  months = 0,
  days = 0,
  hours = 0,
  minutes = 0,
  seconds = 0,
  milliseconds = 0,
}) {
  const result = dayjs()
    .add(
      dayjs.duration({
        years,
        months,
        days,
        hours,
        minutes,
        seconds,
        milliseconds,
      })
    )
    .format();
  return result;
}

export function fSub({
  years = 0,
  months = 0,
  days = 0,
  hours = 0,
  minutes = 0,
  seconds = 0,
  milliseconds = 0,
}) {
  const result = dayjs()
    .subtract(
      dayjs.duration({
        years,
        months,
        days,
        hours,
        minutes,
        seconds,
        milliseconds,
      })
    )
    .format();
  return result;
}

export const getFirstDayOfCurrentMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

export function fDaysDuration(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  if (!start.isValid() || !end.isValid()) return 'Invalid time value';
  return end.diff(start, 'day');
}

export function getCurrentFiscalYearShort() {
  const now = dayjs();
  const year = now.year();
  const month = now.month();
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;
  const startShort = String(startYear).slice(-2);
  const endShort = String(endYear).slice(-2);
  return `${startShort}-${endShort}`;
}

