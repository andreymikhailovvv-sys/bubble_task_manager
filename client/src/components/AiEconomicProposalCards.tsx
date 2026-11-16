import { useCallback, useEffect, useState } from 'react';
import { EconomicAiProposalCard, type EconomicAiProposal } from './EconomicAiProposalCard';
import './AiEconomicProposalCards.css';

const base = '/api/economic/assistant';
async function readJson<T>(path: string, method: 'GET' | 'PUT' = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(base + path, {
    credentials: 'include', cache: 'no-store', method,
    headers: { Accept: 'application/json', ...(method === 'PUT' ? { 'Content-Type': 'application/json' } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const json = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(json.error || 'Не удалось обновить финансовое предложение');
  return json;
}

/** The exact Economic assistant card, now embedded in the parent AI reply.
 * The backend owns every proposal and action; no copy of finance logic lives
 * in the web or Android client. Reconcile chips on history reload/return. */
export function AiEconomicProposalCards({ proposals }: { proposals: EconomicAiProposal[] }) {
  const [views, setViews] = useState(proposals);
  const [autoApply, setAutoApply] = useState(false);
  const [syncError, setSyncError] = useState('');
  const ids = proposals.map(item => item.id).join('|');

  const reload = useCallback(async () => {
    const results = await Promise.all(proposals.map(item =>
      readJson<EconomicAiProposal>('/proposals/' + encodeURIComponent(item.id))));
    setViews(results);
  }, [ids]);

  useEffect(() => {
    let active = true;
    const idsToLoad = proposals.map(item => item.id);
    Promise.all([
      Promise.all(idsToLoad.map(id => readJson<EconomicAiProposal>('/proposals/' + encodeURIComponent(id)))),
      readJson<{ autoApply: boolean }>('/preferences')
    ]).then(([fresh, preferences]) => {
      if (!active) return;
      setViews(fresh);
      setAutoApply(preferences.autoApply === true);
      setSyncError('');
    }).catch(() => {
      // Keep the server-supplied cards visible even if a refresh fails.
      if (active) setSyncError('Не удалось проверить актуальный статус. Повторите после обновления чата.');
    });
    return () => { active = false; };
  }, [ids]);

  const setAutomatic = useCallback(async (enabled: boolean) => {
    const result = await readJson<{ autoApply: boolean }>('/preferences', 'PUT', { autoApply: enabled });
    setAutoApply(result.autoApply);
  }, []);

  if (!proposals.length) return null;
  return <div className="ai-inline-economic-proposals" aria-label="Финансовые действия ИИ">
    {syncError ? <div className="ai-inline-economic-error" role="status">{syncError}</div> : null}
    {views.map(item => <EconomicAiProposalCard key={item.id} initial={item}
      autoApply={autoApply} onAutoApplyChange={setAutomatic} onRefresh={reload}/>)}
  </div>;
}
