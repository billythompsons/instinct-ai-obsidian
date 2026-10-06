/**
 * Freemius licensing + quota gating for the Obsidian plugin.
 *
 * Plans (USD/month): Free $0 / Starter $5 / Pro $19 / Team $134 / Enterprise $200.
 * The license key is verified against the shared backend
 * (GET /v1/license/verify); this module maps the verified plan to local
 * quotas and feature gates. Monthly usage counters roll over automatically.
 *
 * Obsidian-independent and fully unit tested.
 */

export type PlanId = "free" | "starter" | "pro" | "team" | "enterprise";

export type FeatureId = "summarize" | "askVault" | "voiceNotes";

export interface Plan {
	id: PlanId;
	name: string;
	priceMonthly: number;
	/** AI calls per calendar month. Infinity = unlimited fair use. */
	monthlyCalls: number;
	features: Record<FeatureId, boolean>;
	/** Max markdown notes indexed for vault Q&A. Infinity = no cap. */
	maxIndexedNotes: number;
}

export const PLANS: Record<PlanId, Plan> = {
	free: {
		id: "free",
		name: "Free",
		priceMonthly: 0,
		monthlyCalls: 50,
		features: { summarize: true, askVault: false, voiceNotes: false },
		maxIndexedNotes: 0,
	},
	starter: {
		id: "starter",
		name: "Starter",
		priceMonthly: 5,
		monthlyCalls: 500,
		features: { summarize: true, askVault: true, voiceNotes: false },
		maxIndexedNotes: 500,
	},
	pro: {
		id: "pro",
		name: "Pro",
		priceMonthly: 19,
		monthlyCalls: 5000,
		features: { summarize: true, askVault: true, voiceNotes: true },
		maxIndexedNotes: Infinity,
	},
	team: {
		id: "team",
		name: "Team",
		priceMonthly: 134,
		monthlyCalls: 50_000,
		features: { summarize: true, askVault: true, voiceNotes: true },
		maxIndexedNotes: Infinity,
	},
	enterprise: {
		id: "enterprise",
		name: "Enterprise",
		priceMonthly: 200,
		monthlyCalls: Infinity,
		features: { summarize: true, askVault: true, voiceNotes: true },
		maxIndexedNotes: Infinity,
	},
};

/**
 * Freemius product ID for Instinct AI (Obsidian). 0 = placeholder until the
 * product is created in the Freemius dashboard; the parent agent fills this in.
 */
export const FREEMIUS_PRODUCT_ID = 0;

/** Checkout/upgrade URL. Uses the Freemius checkout once FREEMIUS_PRODUCT_ID is set. */
export function upgradeUrl(): string {
	if (FREEMIUS_PRODUCT_ID > 0) {
		return `https://checkout.freemius.com/mode/dialog/product/${FREEMIUS_PRODUCT_ID}/`;
	}
	return "https://github.com/billythompsons/instinct-ai-obsidian#pricing";
}

/** Normalize a plan string from /v1/license/verify into a PlanId. Unknown -> "free". */
export function planIdFromString(plan: string | null | undefined): PlanId {
	const p = (plan ?? "").trim().toLowerCase();
	if (p === "starter") return "starter";
	if (p === "pro") return "pro";
	if (p === "team") return "team";
	if (p === "enterprise") return "enterprise";
	return "free";
}

/** "YYYY-MM" key for the month containing `date` (local time). */
export function currentMonthKey(date: Date = new Date()): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	return `${y}-${m}`;
}

export interface QuotaState {
	month: string;
	used: number;
}

export function freshQuota(date: Date = new Date()): QuotaState {
	return { month: currentMonthKey(date), used: 0 };
}

/**
 * Roll the quota into the current month if needed, then record `units`.
 * Returns the updated quota state (mutates the passed object).
 */
export function recordUse(quota: QuotaState, units: number, date: Date = new Date()): QuotaState {
	const key = currentMonthKey(date);
	if (quota.month !== key) {
		quota.month = key;
		quota.used = 0;
	}
	quota.used += Math.max(0, Math.floor(units));
	return quota;
}

/** Calls remaining this month, or Infinity for unlimited plans. */
export function remainingCalls(plan: Plan, quota: QuotaState, date: Date = new Date()): number {
	if (!Number.isFinite(plan.monthlyCalls)) return Infinity;
	const key = currentMonthKey(date);
	const used = quota.month === key ? quota.used : 0;
	return Math.max(0, plan.monthlyCalls - used);
}

export interface GateResult {
	allowed: boolean;
	/** Human-readable reason when blocked; shown in a Notice. */
	reason?: string;
}

/**
 * Decide whether `feature` may run on `plan` given current quota.
 * Feature availability is checked before quota so the upgrade message
 * names the right plan.
 */
export function gateFeature(
	plan: Plan,
	feature: FeatureId,
	quota: QuotaState,
	date: Date = new Date()
): GateResult {
	if (!plan.features[feature]) {
		return {
			allowed: false,
			reason: featureUpgradeReason(feature, plan),
		};
	}
	if (remainingCalls(plan, quota, date) <= 0) {
		return {
			allowed: false,
			reason:
				`You've used all ${plan.monthlyCalls} AI calls on the ${plan.name} plan this month. ` +
				`Usage resets on the 1st — or upgrade for a higher limit.`,
		};
	}
	return { allowed: true };
}

function featureUpgradeReason(feature: FeatureId, plan: Plan): string {
	switch (feature) {
		case "askVault":
			return (
				`Vault Q&A needs the Starter plan ($5/mo) or higher — you're on ${plan.name}. ` +
				`Activate a license key in Settings → Instinct AI to unlock it.`
			);
		case "voiceNotes":
			return (
				`Voice notes need the Pro plan ($19/mo) or higher — you're on ${plan.name}. ` +
				`Activate a license key in Settings → Instinct AI to unlock it.`
			);
		case "summarize":
			return "Summarization is available on every plan, including Free.";
	}
}

/** Short quota line for the settings tab, e.g. "37 / 500 calls used (463 left)". */
export function quotaSummary(plan: Plan, quota: QuotaState, date: Date = new Date()): string {
	if (!Number.isFinite(plan.monthlyCalls)) {
		return `${plan.name} plan — unlimited fair use.`;
	}
	const key = currentMonthKey(date);
	const used = quota.month === key ? quota.used : 0;
	const left = Math.max(0, plan.monthlyCalls - used);
	return `${plan.name} plan — ${used.toLocaleString()} / ${plan.monthlyCalls.toLocaleString()} calls used (${left.toLocaleString()} left, resets monthly).`;
}
