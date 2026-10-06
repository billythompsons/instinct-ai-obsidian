import { describe, expect, it } from "vitest";
import {
	PLANS,
	currentMonthKey,
	freshQuota,
	gateFeature,
	planIdFromString,
	quotaSummary,
	recordUse,
	remainingCalls,
	upgradeUrl,
	type QuotaState,
} from "../src/licensing";

function quota(used: number, month = currentMonthKey()): QuotaState {
	return { month, used };
}

describe("PLANS", () => {
	it("matches the Freemius ladder $0/$5/$19/$134/$200", () => {
		expect(PLANS.free.priceMonthly).toBe(0);
		expect(PLANS.starter.priceMonthly).toBe(5);
		expect(PLANS.pro.priceMonthly).toBe(19);
		expect(PLANS.team.priceMonthly).toBe(134);
		expect(PLANS.enterprise.priceMonthly).toBe(200);
	});

	it("gates features per plan", () => {
		expect(PLANS.free.features).toEqual({ summarize: true, askVault: false, voiceNotes: false });
		expect(PLANS.starter.features.askVault).toBe(true);
		expect(PLANS.starter.features.voiceNotes).toBe(false);
		expect(PLANS.pro.features.voiceNotes).toBe(true);
	});

	it("sets monthly call quotas", () => {
		expect(PLANS.free.monthlyCalls).toBe(50);
		expect(PLANS.starter.monthlyCalls).toBe(500);
		expect(PLANS.pro.monthlyCalls).toBe(5000);
		expect(PLANS.team.monthlyCalls).toBe(50_000);
		expect(PLANS.enterprise.monthlyCalls).toBe(Infinity);
	});

	it("caps starter indexing, leaves pro+ uncapped", () => {
		expect(PLANS.starter.maxIndexedNotes).toBe(500);
		expect(PLANS.pro.maxIndexedNotes).toBe(Infinity);
		expect(PLANS.free.maxIndexedNotes).toBe(0);
	});
});

describe("planIdFromString", () => {
	it("maps backend plan names case-insensitively", () => {
		expect(planIdFromString("Pro")).toBe("pro");
		expect(planIdFromString("TEAM")).toBe("team");
		expect(planIdFromString("enterprise")).toBe("enterprise");
		expect(planIdFromString("starter")).toBe("starter");
	});

	it("falls back to free for unknown/missing plans", () => {
		expect(planIdFromString("banana")).toBe("free");
		expect(planIdFromString(null)).toBe("free");
		expect(planIdFromString(undefined)).toBe("free");
	});
});

describe("gateFeature", () => {
	it("allows summarize on free within quota", () => {
		expect(gateFeature(PLANS.free, "summarize", quota(10)).allowed).toBe(true);
	});

	it("blocks askVault on free with an upgrade reason", () => {
		const r = gateFeature(PLANS.free, "askVault", quota(0));
		expect(r.allowed).toBe(false);
		expect(r.reason).toMatch(/Starter.*\$5/i);
	});

	it("blocks voiceNotes on starter", () => {
		const r = gateFeature(PLANS.starter, "voiceNotes", quota(0));
		expect(r.allowed).toBe(false);
		expect(r.reason).toMatch(/Pro.*\$19/i);
	});

	it("allows askVault and voiceNotes on pro", () => {
		expect(gateFeature(PLANS.pro, "askVault", quota(0)).allowed).toBe(true);
		expect(gateFeature(PLANS.pro, "voiceNotes", quota(0)).allowed).toBe(true);
	});

	it("blocks when the monthly quota is exhausted", () => {
		const r = gateFeature(PLANS.free, "summarize", quota(50));
		expect(r.allowed).toBe(false);
		expect(r.reason).toMatch(/50.*calls/i);
	});

	it("checks feature availability before quota", () => {
		// Free + exhausted quota asking for vault Q&A: the reason must be about
		// the plan, not the quota.
		const r = gateFeature(PLANS.free, "askVault", quota(50));
		expect(r.allowed).toBe(false);
		expect(r.reason).toMatch(/Starter/);
	});
});

describe("quota accounting", () => {
	it("records usage and computes remaining calls", () => {
		const q = freshQuota();
		recordUse(q, 3);
		expect(q.used).toBe(3);
		expect(remainingCalls(PLANS.starter, q)).toBe(497);
	});

	it("rolls over into a new month", () => {
		const jan = new Date(2026, 0, 15);
		const feb = new Date(2026, 1, 2);
		const q = quota(50, currentMonthKey(jan));
		recordUse(q, 5, feb);
		expect(q.month).toBe(currentMonthKey(feb));
		expect(q.used).toBe(5);
		expect(remainingCalls(PLANS.free, q, feb)).toBe(45);
	});

	it("ignores stale months when computing remaining", () => {
		const old = quota(50, "2020-01");
		expect(remainingCalls(PLANS.free, old)).toBe(50);
	});

	it("floors negative and fractional units", () => {
		const q = freshQuota();
		recordUse(q, -4);
		recordUse(q, 2.9);
		expect(q.used).toBe(2);
	});

	it("summarizes quota for the settings tab", () => {
		const s = quotaSummary(PLANS.pro, quota(120));
		expect(s).toMatch(/Pro/);
		expect(s).toContain("120");
		expect(s).toContain("5,000");
		const unlimited = quotaSummary(PLANS.enterprise, quota(999_999));
		expect(unlimited).toMatch(/unlimited/i);
	});
});

describe("upgradeUrl", () => {
	it("returns a URL", () => {
		expect(upgradeUrl()).toMatch(/^https:\/\//);
	});
});
