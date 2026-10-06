export const CHANNELS = ['x', 'linkedin', 'bluesky', 'threads', 'mastodon'] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LIMITS: Record<Channel, number> = {
  x: 280,
  linkedin: 3000,
  bluesky: 300,
  threads: 500,
  mastodon: 500,
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  x: 'X',
  linkedin: 'LinkedIn',
  bluesky: 'Bluesky',
  threads: 'Threads',
  mastodon: 'Mastodon',
};

export type PlanId = 'free' | 'pro';

export interface Plan {
  id: PlanId;
  name: string;
  /** null = founder has not set a price; UI must not invent one. */
  priceMonthlyUsd: number | null;
  maxRepos: number;
  signalsPerMonth: number;
  channels: Channel[];
  autopilot: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthlyUsd: 0,
    maxRepos: 1,
    signalsPerMonth: 30,
    channels: ['x', 'linkedin', 'bluesky'],
    autopilot: false,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthlyUsd: null, // FOUNDER GATE: set price + billing before selling.
    maxRepos: 25,
    signalsPerMonth: 1000,
    channels: [...CHANNELS],
    autopilot: true,
  },
};

export function planOf(id: string | null | undefined): Plan {
  return id === 'pro' ? PLANS.pro : PLANS.free;
}

export function monthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
