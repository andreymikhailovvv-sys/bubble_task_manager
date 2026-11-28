export type PlanikSendMode = 'telegram-send' | 'mail-send';
export const PLANIK_SEND_EVENT = 'planirovych:confirmed-send';
const recent = new Map<string, number>();
// A confirmed delivery may be observed by several views or retry-status polls.
export function announcePlanikSend(mode: PlanikSendMode, deliveryId: string) {
  const now = Date.now();
  for (const [id, at] of recent) if (now - at > 60_000) recent.delete(id);
  const key = mode + ':' + deliveryId;
  if (recent.has(key)) return;
  recent.set(key, now);
  window.dispatchEvent(new CustomEvent<PlanikSendMode>(PLANIK_SEND_EVENT, { detail: mode }));
}
export function PlanikSendGesture({ mode, armColor, handColor }: {mode: PlanikSendMode; armColor: string; handColor: string}) {
  return mode === 'telegram-send' ? <g className="planik-send-gesture planik-send-telegram" aria-hidden="true">
    <g className="planik-plane-arm">
      <path d="M133 194Q104 207 88 180" fill="none" stroke={armColor} strokeWidth="17" strokeLinecap="round"/>
      <circle cx="88" cy="180" r="10" fill={handColor}/>
    </g>
    <g className="planik-paper-plane">
      <path d="M51 148L116 170L85 179L75 195L69 174Z" fill="#38bdf8" stroke="#bae6fd" strokeWidth="2.5" strokeLinejoin="round"/>
      <path d="M51 148L85 179L69 174Z" fill="#e0f2fe"/>
      <path d="M85 179L75 195L78 177Z" fill="#0284c7"/>
    </g>
    <g className="planik-plane-trail" fill="none" stroke="#7dd3fc" strokeWidth="3" strokeLinecap="round">
      <path d="M107 184l18 10M109 173l22 5"/>
    </g>
  </g> : <g className="planik-send-gesture planik-send-mail" aria-hidden="true">
    <g className="planik-mailbox">
      <g transform="translate(82 217) scale(1.24) translate(-82 -217)">
      <path d="M81 249v35" stroke="#7891b2" strokeWidth="12" strokeLinecap="round"/>
      <rect x="46" y="206" width="74" height="55" rx="12" fill="#4265a2" stroke="#b9d4f5" strokeWidth="2.5"/>
      <path d="M47 221h72" stroke="#29446c" strokeWidth="7"/>
      <rect x="55" y="213" width="56" height="8" rx="4" fill="#142c47"/>
      <path d="M119 217v-23h-15v11h15" fill="#f87171" stroke="#fecaca" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M62 244h42" stroke="#9eb9dc" strokeWidth="3" strokeLinecap="round"/>
      </g>
    </g>
    <g className="planik-mail-arm">
      <path d="M133 194Q122 163 96 162" fill="none" stroke={armColor} strokeWidth="17" strokeLinecap="round"/>
      <circle cx="96" cy="162" r="10" fill={handColor}/>
    </g>
    <g className="planik-mail-letter">
      <rect x="66" y="156" width="49" height="32" rx="4" fill="#f8fafc" stroke="#9ab5da" strokeWidth="2"/>
      <path d="M67 160l23 16 24-16M67 186l15-13M114 186l-15-13" fill="none" stroke="#7996bc" strokeWidth="2" strokeLinejoin="round"/>
    </g>
    <g className="planik-mail-success">
      <circle cx="82" cy="238" r="12" fill="#2b92b5" stroke="#c8f1fc" strokeWidth="2"/>
      <path d="M76 238l4 4 8-9" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none"/>
    </g>
  </g>;
}
