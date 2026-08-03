export type AcquisitionKind = 'utm' | 'referrer' | 'direct';

export type AcquisitionTouch = {
  readonly kind: AcquisitionKind;
  readonly source: string;
  readonly medium: string;
  readonly referringDomain?: string;
  readonly landingPath: string;
};

export type AcquisitionAttribution = {
  readonly first: AcquisitionTouch;
  readonly latest: AcquisitionTouch;
};

export type AcquisitionInput = {
  readonly href: string;
  readonly referrer: string;
};

export type PostHogAcquisitionApi = {
  readonly register?: (properties: Record<string, string>) => void;
  readonly register_once?: (properties: Record<string, string>) => void;
  readonly people?: {
    readonly set?: (properties: Record<string, string>) => void;
    readonly set_once?: (properties: Record<string, string>) => void;
  };
};

export type PostHogPrivacyConfig = {
  readonly capture_pageview: false;
  readonly capture_pageleave: false;
  readonly save_campaign_params: false;
  readonly save_referrer: false;
  readonly mask_personal_data_properties: true;
  readonly property_denylist: string[];
};

const SEARCH_REFERRER_DOMAINS = [
  'baidu.com',
  'bing.com',
  'duckduckgo.com',
  'google.com',
  'naver.com',
  'yahoo.com',
  'yandex.com',
] as const;

const SOCIAL_REFERRER_DOMAINS = [
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'reddit.com',
  'threads.net',
  'tiktok.com',
  'twitter.com',
  'x.com',
  'youtu.be',
  'youtube.com',
] as const;

const SAFE_ATTRIBUTION_VALUE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

const POSTHOG_PRIVACY_DENYLIST = [
  '$current_url',
  '$referrer',
  '$referring_domain',
  '$initial_referrer',
  '$initial_referring_domain',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
  'gad_source',
  'mc_cid',
  'gclid',
  'dclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'msclkid',
  'twclid',
  'li_fat_id',
  'igshid',
  'ttclid',
  'rdt_cid',
  'epik',
  'qclid',
  'sccid',
  'irclid',
  '_kx',
] as const;

export function buildPostHogPrivacyConfig(): PostHogPrivacyConfig {
  return {
    capture_pageview: false,
    capture_pageleave: false,
    save_campaign_params: false,
    save_referrer: false,
    mask_personal_data_properties: true,
    property_denylist: [...POSTHOG_PRIVACY_DENYLIST],
  };
}

export function buildAcquisitionTouch(input: AcquisitionInput): AcquisitionTouch {
  const currentUrl = parseAbsoluteUrl(input.href);
  const searchParams = currentUrl?.searchParams ?? new URLSearchParams();
  const referringDomain = getExternalReferringDomain({
    referrer: input.referrer,
    currentHost: currentUrl?.hostname,
  });
  const landingPath = currentUrl?.pathname || '/';
  const utmSource = readSafeQueryValue(searchParams, 'utm_source');
  const utmMedium = readSafeQueryValue(searchParams, 'utm_medium');
  const hasUtmSignal =
    utmSource !== undefined ||
    utmMedium !== undefined ||
    hasQueryValue(searchParams, 'utm_campaign') ||
    hasQueryValue(searchParams, 'utm_content') ||
    hasQueryValue(searchParams, 'utm_term') ||
    hasQueryValue(searchParams, 'utm_id');

  if (hasUtmSignal) {
    return {
      kind: 'utm',
      source: utmSource ?? referringDomain ?? 'utm',
      medium: utmMedium ?? inferUtmMedium(utmSource),
      landingPath,
      ...(referringDomain ? { referringDomain } : {}),
    };
  }

  if (referringDomain) {
    return {
      kind: 'referrer',
      source: referringDomain,
      medium: inferReferrerMedium(referringDomain),
      referringDomain,
      landingPath,
    };
  }

  return {
    kind: 'direct',
    source: 'direct',
    medium: 'direct',
    landingPath,
  };
}

export function buildPostHogAcquisitionProperties(
  attribution: AcquisitionAttribution,
): Record<string, string> {
  return {
    ...buildPrefixedProperties('acquisition_first', attribution.first),
    ...buildPrefixedProperties('acquisition_latest', attribution.latest),
  };
}

export function registerAcquisitionAttribution(
  posthog: PostHogAcquisitionApi | undefined,
  input: AcquisitionInput,
): void {
  const touch = buildAcquisitionTouch(input);
  const firstProperties = buildPrefixedProperties('acquisition_first', touch);
  const latestProperties = buildPrefixedProperties('acquisition_latest', touch);

  posthog?.register_once?.(firstProperties);
  posthog?.register?.(latestProperties);
  posthog?.people?.set_once?.(firstProperties);
  posthog?.people?.set?.(latestProperties);
}

function buildPrefixedProperties(prefix: string, touch: AcquisitionTouch): Record<string, string> {
  const properties: Record<string, string> = {
    [`${prefix}_kind`]: touch.kind,
    [`${prefix}_source`]: touch.source,
    [`${prefix}_medium`]: touch.medium,
    [`${prefix}_landing_path`]: touch.landingPath,
  };

  addOptionalProperty(properties, `${prefix}_referring_domain`, touch.referringDomain);

  return properties;
}

function addOptionalProperty(properties: Record<string, string>, key: string, value: string | undefined) {
  if (value) {
    properties[key] = value;
  }
}

function readQueryValue(searchParams: URLSearchParams, key: string): string | undefined {
  const value = searchParams.get(key)?.trim();
  return value ? value : undefined;
}

function hasQueryValue(searchParams: URLSearchParams, key: string): boolean {
  return readQueryValue(searchParams, key) !== undefined;
}

function readSafeQueryValue(searchParams: URLSearchParams, key: string): string | undefined {
  const value = readQueryValue(searchParams, key)?.toLowerCase();
  if (!value || !SAFE_ATTRIBUTION_VALUE_PATTERN.test(value)) {
    return undefined;
  }

  return value;
}

function parseAbsoluteUrl(value: string): URL | undefined {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return undefined;
  }

  try {
    return new URL(trimmedValue);
  } catch (error) {
    if (error instanceof TypeError) {
      return undefined;
    }

    throw error;
  }
}

function getExternalReferringDomain({
  referrer,
  currentHost,
}: {
  readonly referrer: string;
  readonly currentHost?: string;
}): string | undefined {
  const referrerUrl = parseAbsoluteUrl(referrer);
  const domain = referrerUrl?.hostname.toLowerCase();
  if (!domain || domain === currentHost?.toLowerCase()) {
    return undefined;
  }

  return domain;
}

function inferUtmMedium(source: string | undefined): string {
  if (!source) {
    return 'utm';
  }

  if (isKnownSocialDomain(source)) {
    return 'paid_social';
  }

  if (isKnownSearchDomain(source)) {
    return 'paid_search';
  }

  return 'utm';
}

function inferReferrerMedium(domain: string): string {
  if (isKnownSearchDomain(domain)) {
    return 'organic_search';
  }

  if (isKnownSocialDomain(domain)) {
    return 'social_referral';
  }

  return 'referral';
}

function isKnownSearchDomain(domain: string): boolean {
  return SEARCH_REFERRER_DOMAINS.some((knownDomain) => matchesDomain(domain, knownDomain));
}

function isKnownSocialDomain(domain: string): boolean {
  return SOCIAL_REFERRER_DOMAINS.some((knownDomain) => matchesDomain(domain, knownDomain));
}

function matchesDomain(domain: string, knownDomain: string): boolean {
  return domain === knownDomain || domain.endsWith(`.${knownDomain}`);
}
