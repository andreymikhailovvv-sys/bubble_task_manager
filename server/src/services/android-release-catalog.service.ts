/**
 * Public Android release catalog.
 *
 * APKs live as immutable, versioned GitHub Release assets, NOT on an
 * ephemeral application container. Only assets from our exact public
 * repository and matching android-v<versionCode> tags may be published.
 * This API never accepts a caller-supplied URL or signs installer binaries.
 */
const RELEASE_REPO = 'andreymikhailovvv-sys/bubble_task_manager';
const RELEASE_ASSET = 'planirovych-android.apk';
const LIST_URL = `https://api.github.com/repos/${RELEASE_REPO}/releases?per_page=30`;
const ANDROID_TAG = /^android-v([1-9][0-9]*)$/;
const CACHE_MS = 5 * 60_000;

export type AndroidPublicRelease = {
  available: true;
  versionCode: number;
  versionName: string;
  notes: string;
  publishedAt: string;
  sizeBytes: number;
  downloadPath: '/api/android/download';
  source: 'github-releases';
};
export type AndroidReleaseCatalog = AndroidPublicRelease | { available: false };

type GithubAsset = {
  name?: unknown;
  size?: unknown;
  browser_download_url?: unknown;
};
type GithubRelease = {
  draft?: unknown;
  prerelease?: unknown;
  tag_name?: unknown;
  name?: unknown;
  body?: unknown;
  published_at?: unknown;
  assets?: unknown;
};
type Selected = { public: AndroidPublicRelease; assetUrl: string };
let cached: { expiresAt: number; selected: Selected | null } | null = null;
let inFlight: Promise<Selected | null> | null = null;

export function selectAndroidRelease(data: unknown): Selected | null {
  if (!Array.isArray(data)) throw new Error('Некорректный ответ каталога выпусков');
  let best: Selected | null = null;
  for (const raw of data as GithubRelease[]) {
    if (!raw || typeof raw !== 'object' || raw.draft || raw.prerelease) continue;
    const match = typeof raw.tag_name === 'string' ? ANDROID_TAG.exec(raw.tag_name) : null;
    if (!match) continue;
    const code = Number(match[1]);
    if (!Number.isSafeInteger(code) || code > 2_147_483_647) continue;
    const assets: GithubAsset[] = Array.isArray(raw.assets) ? raw.assets : [];
    const asset = assets.find(a => a?.name === RELEASE_ASSET && Number.isFinite(a.size) && Number(a.size) > 0);
    if (!asset || typeof asset.browser_download_url !== 'string') continue;
    const expectedPrefix = `https://github.com/${RELEASE_REPO}/releases/download/${raw.tag_name}/`;
    if (asset.browser_download_url !== expectedPrefix + RELEASE_ASSET) continue;
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    const versionName = (name.match(/\b(\d+\.\d+\.\d+)\b/)?.[1] ?? `#${code}`);
    const notes = typeof raw.body === 'string' ? raw.body.trim().slice(0, 1200) : '';
    const publishedAt = typeof raw.published_at === 'string'
      && Number.isFinite(Date.parse(raw.published_at)) ? raw.published_at : '';
    if (!best || code > best.public.versionCode) {
      best = {
        public: {
          available: true,
          versionCode: code,
          versionName,
          notes,
          publishedAt,
          sizeBytes: Number(asset.size),
          downloadPath: '/api/android/download',
          source: 'github-releases'
        },
        assetUrl: asset.browser_download_url
      };
    }
  }
  return best;
}

export async function latestAndroidRelease(): Promise<Selected | null> {
  if (cached && Date.now() < cached.expiresAt) return cached.selected;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const response = await fetch(LIST_URL, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Planirovych-Android-Releases',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      signal: AbortSignal.timeout(7_000)
    });
    if (!response.ok) throw new Error(`GitHub releases unavailable (HTTP ${response.status})`);
    const selected = selectAndroidRelease(await response.json());
    cached = { expiresAt: Date.now() + CACHE_MS, selected };
    return selected;
  })().finally(() => { inFlight = null; });
  return inFlight;
}
