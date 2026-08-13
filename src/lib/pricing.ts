import { addDays, daysUntil, eachNight, isWeekendNight, nightsBetween, toDateKey } from './dates';
import { RESORT_FEE_CENTS_PER_NIGHT, SERVICE_FEE_RATE, TAX_RATE, applyRate } from './money';

export interface RateRuleInput {
  label: string;
  startDate: Date | string;
  endDate: Date | string;
  multiplier: number;
  priority: number;
}

export interface PricingContext {
  baseRateCents: number;
  checkIn: Date | string;
  checkOut: Date | string;
  adults: number;
  children: number;
  maxAdults: number;
  occupancyByDate?: Record<string, number>;
  rateRules?: RateRuleInput[];
  ratePlanAdjustmentPct?: number;
  today?: Date;
}

export interface NightlyRate {
  date: string;
  rateCents: number;
  baseCents: number;
  factors: { label: string; multiplier: number }[];
}

export interface PriceQuote {
  nights: number;
  nightly: NightlyRate[];
  averageNightlyCents: number;
  roomSubtotalCents: number;
  extraGuestCents: number;
  lengthOfStayDiscountCents: number;
  ratePlanAdjustmentCents: number;
  subtotalCents: number;
  resortFeeCents: number;
  serviceFeeCents: number;
  taxesCents: number;
  feesCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
}

export const WEEKEND_MULTIPLIER = 1.25;
export const EXTRA_ADULT_CENTS_PER_NIGHT = 4000;

export function demandMultiplier(occupancy: number): number {
  const o = Math.min(1, Math.max(0, occupancy));
  if (o >= 0.95) return 1.6;
  if (o >= 0.85) return 1.4;
  if (o >= 0.7) return 1.22;
  if (o >= 0.5) return 1.08;
  if (o >= 0.3) return 1.0;
  return 0.92;
}

export function leadTimeMultiplier(daysAhead: number): number {
  if (daysAhead < 0) return 1;
  if (daysAhead <= 2) return 0.88;
  if (daysAhead <= 7) return 0.95;
  if (daysAhead >= 120) return 0.9;
  if (daysAhead >= 45) return 0.96;
  return 1;
}

export function lengthOfStayDiscountPct(nights: number): number {
  if (nights >= 28) return 25;
  if (nights >= 14) return 18;
  if (nights >= 7) return 12;
  if (nights >= 4) return 6;
  return 0;
}

export function resolveSeasonalMultiplier(
  date: Date,
  rules: RateRuleInput[] = [],
): { multiplier: number; label: string | null } {
  const key = toDateKey(date);
  const matching = rules
    .filter((r) => toDateKey(r.startDate) <= key && key <= toDateKey(r.endDate))
    .sort((a, b) => b.priority - a.priority);
  const winner = matching[0];
  return winner
    ? { multiplier: winner.multiplier, label: winner.label }
    : { multiplier: 1, label: null };
}

export function quoteStay(ctx: PricingContext): PriceQuote {
  const today = ctx.today ?? new Date();
  const nights = nightsBetween(ctx.checkIn, ctx.checkOut);
  if (nights <= 0) {
    throw new RangeError('Check-out must be at least one night after check-in.');
  }

  const nightly: NightlyRate[] = eachNight(ctx.checkIn, ctx.checkOut).map((night) => {
    const key = toDateKey(night);
    const factors: { label: string; multiplier: number }[] = [];

    const season = resolveSeasonalMultiplier(night, ctx.rateRules);
    if (season.multiplier !== 1 && season.label) {
      factors.push({ label: season.label, multiplier: season.multiplier });
    }

    if (isWeekendNight(night)) {
      factors.push({ label: 'Weekend night', multiplier: WEEKEND_MULTIPLIER });
    }

    const occupancy = ctx.occupancyByDate?.[key];
    if (typeof occupancy === 'number') {
      const dm = demandMultiplier(occupancy);
      if (dm !== 1) {
        factors.push({
          label:
            dm > 1 ? `High demand (${Math.round(occupancy * 100)}% sold)` : 'Low demand window',
          multiplier: dm,
        });
      }
    }

    const lead = leadTimeMultiplier(daysUntil(night, today));
    if (lead !== 1) {
      factors.push({
        label: lead < 1 ? 'Advance-purchase saving' : 'Peak lead time',
        multiplier: lead,
      });
    }

    const rateCents = Math.round(factors.reduce((acc, f) => acc * f.multiplier, ctx.baseRateCents));

    return { date: key, rateCents, baseCents: ctx.baseRateCents, factors };
  });

  const roomSubtotalCents = nightly.reduce((acc, n) => acc + n.rateCents, 0);

  const extraAdults = Math.max(0, ctx.adults - ctx.maxAdults);
  const extraGuestCents = extraAdults * EXTRA_ADULT_CENTS_PER_NIGHT * nights;

  const losPct = lengthOfStayDiscountPct(nights);
  const lengthOfStayDiscountCents = Math.round((roomSubtotalCents * losPct) / 100);

  const planPct = ctx.ratePlanAdjustmentPct ?? 0;
  const ratePlanAdjustmentCents = Math.round(
    ((roomSubtotalCents - lengthOfStayDiscountCents) * planPct) / 100,
  );

  const subtotalCents =
    roomSubtotalCents + extraGuestCents - lengthOfStayDiscountCents + ratePlanAdjustmentCents;

  const resortFeeCents = RESORT_FEE_CENTS_PER_NIGHT * nights;
  const serviceFeeCents = applyRate(subtotalCents, SERVICE_FEE_RATE);
  const feesCents = resortFeeCents + serviceFeeCents;
  const taxesCents = applyRate(subtotalCents + resortFeeCents, TAX_RATE);

  return {
    nights,
    nightly,
    averageNightlyCents: Math.round(roomSubtotalCents / nights),
    roomSubtotalCents,
    extraGuestCents,
    lengthOfStayDiscountCents,
    ratePlanAdjustmentCents,
    subtotalCents,
    resortFeeCents,
    serviceFeeCents,
    taxesCents,
    feesCents,
    discountCents: lengthOfStayDiscountCents + Math.max(0, -ratePlanAdjustmentCents),
    totalCents: subtotalCents + feesCents + taxesCents,
    currency: 'USD',
  };
}

export function refundForCancellation(params: {
  totalCents: number;
  checkIn: Date | string;
  cancellationHours: number;
  refundable: boolean;
  now?: Date;
}): { refundCents: number; penaltyCents: number; reason: string } {
  const now = params.now ?? new Date();
  if (!params.refundable) {
    return { refundCents: 0, penaltyCents: params.totalCents, reason: 'Non-refundable rate plan' };
  }
  const hoursToArrival = (new Date(params.checkIn).getTime() - now.getTime()) / 3_600_000;
  if (hoursToArrival >= params.cancellationHours) {
    return {
      refundCents: params.totalCents,
      penaltyCents: 0,
      reason: 'Cancelled within free window',
    };
  }
  if (hoursToArrival >= 0) {
    const penalty = Math.round(params.totalCents * 0.5);
    return {
      refundCents: params.totalCents - penalty,
      penaltyCents: penalty,
      reason: 'Late cancellation (50% penalty)',
    };
  }
  return { refundCents: 0, penaltyCents: params.totalCents, reason: 'No-show or past arrival' };
}

export function cheapestNightlyFrom(
  baseRateCents: number,
  checkIn?: Date | string,
  checkOut?: Date | string,
): number {
  if (!checkIn || !checkOut) return baseRateCents;
  try {
    const q = quoteStay({
      baseRateCents,
      checkIn,
      checkOut,
      adults: 2,
      children: 0,
      maxAdults: 2,
    });
    return Math.min(...q.nightly.map((n) => n.rateCents));
  } catch {
    return baseRateCents;
  }
}

export { addDays };
