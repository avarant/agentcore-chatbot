export interface SiteConfig {
  id: string;
  name: string;
  promptId: string;
  memoryId: string;
  runtimeUrl: string;
  kbId: string;
  kbDataSourceId: string;
  kbBucket: string;
}

function parseSitesConfig(): SiteConfig[] {
  const raw = process.env.SITES_CONFIG;
  if (!raw) return [];
  const parsed = JSON.parse(raw) as Array<{
    id: string;
    name: string;
    prompt_id: string;
    memory_id: string;
    runtime_url: string;
    kb_id?: string;
    kb_data_source_id?: string;
    kb_bucket?: string;
  }>;
  return parsed.map((s) => ({
    id: s.id,
    name: s.name,
    promptId: s.prompt_id,
    memoryId: s.memory_id,
    runtimeUrl: s.runtime_url,
    kbId: s.kb_id || "",
    kbDataSourceId: s.kb_data_source_id || "",
    kbBucket: s.kb_bucket || "",
  }));
}

let _cache: SiteConfig[] | null = null;

export function listSites(): SiteConfig[] {
  if (!_cache) _cache = parseSitesConfig();
  return _cache;
}

export function getSite(siteId?: string | null): SiteConfig | undefined {
  const sites = listSites();
  if (!siteId || sites.length <= 1) return sites[0];
  return sites.find((s) => s.id === siteId) ?? sites[0];
}
