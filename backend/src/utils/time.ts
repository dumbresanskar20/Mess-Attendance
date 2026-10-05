/**
 * Time utility for Asia/Kolkata (IST = UTC+05:30)
 */

export function getNowInIST(): Date {
  const now = new Date();
  // IST is UTC + 5 hours 30 minutes
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 5.5 * 3600000);
}

/**
 * Returns current date formatted as 'YYYY-MM-DD' in IST
 */
export function getCurrentISTDateString(): string {
  const ist = getNowInIST();
  const year = ist.getFullYear();
  const month = String(ist.getMonth() + 1).padStart(2, '0');
  const day = String(ist.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns current time formatted as 'HH:mm:ss' in IST
 */
export function getCurrentISTTimeString(): string {
  const ist = getNowInIST();
  const hours = String(ist.getHours()).padStart(2, '0');
  const minutes = String(ist.getMinutes()).padStart(2, '0');
  const seconds = String(ist.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Checks if a given time string (HH:mm:ss) falls between start_time and end_time
 */
export function isTimeInRange(current: string, start: string, end: string): boolean {
  // If start <= end (e.g. 12:00:00 to 15:00:00)
  if (start <= end) {
    return current >= start && current <= end;
  }
  // Overnight range (e.g. 23:00:00 to 02:00:00)
  return current >= start || current <= end;
}
