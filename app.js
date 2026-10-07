// app.js — shared Supabase client + utilities
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://orvizmgloskvqfsralxc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ydml6bWdsb3NrdnFmc3JhbHhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NzE3NzUsImV4cCI6MjA5NzU0Nzc3NX0.qJh1RI0a9vLxxvSpSJHfcaw2drq-sNcCeKy-4FucVY0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function round2(n) {
  return Math.round(n * 100) / 100;
}

export function goToCalculator(medId) {
  location.href = `calculator.html?id=${medId}`;
}

// Escape HTML to prevent XSS when injecting DB content into innerHTML
export function esc(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/**
 * Core dosage calculation — shared by both the catalog flow and the
 * free-calculation flow, so a fix here applies everywhere.
 *
 * IMPORTANT SAFETY BEHAVIOR:
 * Dose range whose LOW end is within maxDailyDoseMg but whose HIGH end is
 * above it: the range is capped at the max daily dose (`capped: true`,
 * `uncappedDailyMax` keeps the original high end) so the clinician still gets
 * a usable range, and the UI must say that the top of the range was capped.
 * When even the low end (or a fixed dose) exceeds maxDailyDoseMg, we do NOT silently
 * clamp the number and continue computing a syrup volume from it. Instead
 * we flag `exceeded: true` and stop the pediatric math. If an adult ceiling
 * (adultMaxDailyDoseMg) was provided, we compute the adult ml-per-dose
 * using the SAME concentration and SAME doses-per-day as the child
 * regimen — this is a deliberate simplification confirmed with the
 * prescribing physician (Dr. Devir): when no adult ceiling is given, the
 * caller must fall back to a generic warning + any free-text adult_dose_note.
 *
 * @param {object} params
 * @param {number} params.weight - child weight in kg
 * @param {number} params.doseMin - mg/kg/day (low end, or the only value if fixed dose)
 * @param {number|null} params.doseMax - mg/kg/day (high end), or null/undefined if fixed dose
 * @param {number} params.concentration - mg/ml
 * @param {number} params.dosesPerDay
 * @param {number|null} params.maxDailyDoseMg - absolute pediatric safety ceiling, or null if not provided (free-calc mode)
 * @param {number|null} params.adultMaxDailyDoseMg - adult ceiling in mg/day, used to auto-compute the fallback dose when exceeded
 */
export function calculateDose({
  weight, doseMin, doseMax, concentration, dosesPerDay,
  maxDailyDoseMg, adultMaxDailyDoseMg
}) {
  const hasRange = doseMax != null && doseMax !== doseMin;

  const dailyMin = round2(doseMin * weight);
  const uncappedDailyMax = hasRange ? round2(doseMax * weight) : dailyMin;

  const exceeded = maxDailyDoseMg != null && dailyMin > maxDailyDoseMg;
  const capped = !exceeded && maxDailyDoseMg != null && uncappedDailyMax > maxDailyDoseMg;
  const dailyMax = capped ? round2(maxDailyDoseMg) : uncappedDailyMax;

  if (exceeded) {
    let adultPerDoseMg = null;
    let adultVolMl = null;
    if (adultMaxDailyDoseMg != null && concentration > 0 && dosesPerDay > 0) {
      adultPerDoseMg = round2(adultMaxDailyDoseMg / dosesPerDay);
      adultVolMl = round2(adultPerDoseMg / concentration);
    }
    return {
      hasRange, dailyMin, dailyMax, uncappedDailyMax, capped: false, exceeded: true,
      perDoseMin: null, perDoseMax: null, volMin: null, volMax: null,
      adultPerDoseMg, adultVolMl,
    };
  }

  const perDoseMin = round2(dailyMin / dosesPerDay);
  const perDoseMax = hasRange ? round2(dailyMax / dosesPerDay) : perDoseMin;

  // Volumes are shown to 0.01 ml. With a max daily dose, never let that display
  // rounding push the amount above the max (matters for tiny volumes): round down instead.
  const toVol = mg => {
    const v = round2(mg / concentration);
    return maxDailyDoseMg != null && v * concentration * dosesPerDay > maxDailyDoseMg + 1e-9
      ? Math.floor(mg / concentration * 100 + 1e-9) / 100 : v;
  };
  const volMin = toVol(perDoseMin);
  const volMax = hasRange ? toVol(perDoseMax) : volMin;

  return { hasRange, dailyMin, dailyMax, uncappedDailyMax, capped, exceeded: false, perDoseMin, perDoseMax, volMin, volMax };
}
