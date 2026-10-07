/** Dataset timestamps are naive 'YYYY-MM-DD HH:MM:SS'; treat them as UTC consistently. */
export const parseT = (t: string) => Date.parse(t.replace(' ', 'T') + 'Z')
export const fmtT = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
export const HOUR = 3600e3

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
export const shortDate = (ms: number) => {
  const d = new Date(ms)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}
export const shortDateTime = (ms: number) => {
  const d = new Date(ms)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${hh}:${mm}`
}
export const sensorName = (s: string) => s.replace('sensor_', 'Sensor ')
