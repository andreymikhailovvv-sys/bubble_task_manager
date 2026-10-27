import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { TaskAiProgress } from './TaskAiProgress';

/** First opt-in response runs in the monitoring worker, not the streaming
 * HTTP request. Display genuine scheduled/processing state from the server.
 * This is not another AI call and incurs no additional credits. */
export function TaskMonitoringIntroProgress({ taskId }: { taskId: string }) {
  const [state, setState] = useState<'scheduled' | 'processing' | null>(null);
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await api.getTaskMonitoringIntroState(taskId);
        if (active) setState(response.state);
      } catch {
        if (active) setState(null);
      } finally {
        inFlight = false;
      }
    };
    const onStart = (event: Event) => {
      if ((event as CustomEvent<{ taskId: string }>).detail?.taskId === taskId) {
        setState('scheduled');
        void poll();
      }
    };
    window.addEventListener('planirovych:monitoring-intro-start', onStart);
    void poll();
    const interval = window.setInterval(() => { void poll(); }, 2500);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('planirovych:monitoring-intro-start', onStart);
    };
  }, [taskId]);

  return state ? <div role="status" aria-label="ИИ готовит первое сообщение автомониторинга">
    <TaskAiProgress status={state === 'scheduled' ? 'analyzing_request' : 'forming_answer'} />
  </div> : null;
}
