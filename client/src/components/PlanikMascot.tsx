import { memo, useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import './PlanikMascot.css';

type PlanikMode = 'idle' | 'hover' | 'typing' | 'searching' | 'painting' | 'celebrating' | 'clearing';

// Fixed particle paths avoid creating random values or timers on every render.
const POPPER_CONFETTI = Array.from({ length: 24 }, (_, index) => ({
  dx: -(55 + (index % 6) * 20 + Math.floor(index / 6) * 14),
  dy: (index % 2 === 0 ? -1 : 1) * (16 + ((index * 19) % 90)),
  rotate: (index % 2 === 0 ? -1 : 1) * (180 + index * 43),
  delay: (index % 5) * 0.025,
  color: ['#ffdf76', '#f39ae5', '#85e6ef', '#a899ff', '#ffd0a0'][index % 5]
}));

type Props = {
  notificationCount?: number;
  typingSignal?: number;
  busy?: boolean;
  responding?: boolean;
  progress?: string | null;
  celebrationKey?: number;
  size?: 'launcher' | 'composer' | 'sidekick';
  className?: string;
};

/**
 * The website's shared, lightweight Planik mascot.
 * It is deliberately independent of task/chat API calls: parent components
 * provide the existing notification, draft, progress and completion signals.
 */
export const PlanikMascot = memo(function PlanikMascot({
  notificationCount = 0,
  busy = false,
  responding = false,
  progress,
  celebrationKey = 0,
  size = 'launcher',
  className = ''
}: Props) {
  const gradientSuffix = useId().replace(/:/g, '');
  const [hovered, setHovered] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  // Keep the previous number alive while the hand removes and discards it.
  // Starting with zero (or fetching notifications for the first time)
  // must never trigger a fake clearing animation.
  const initialCount = Math.max(0, Math.floor(Number.isFinite(notificationCount) ? notificationCount : 0));
  const priorNotificationCount = useRef(initialCount);
  const [clearingCount, setClearingCount] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const priorCelebration = useRef(celebrationKey);
  const leftEye = useRef<SVGGElement>(null);
  const rightEye = useRef<SVGGElement>(null);
  const leftHand = useRef<SVGGElement>(null);
  const rightHand = useRef<SVGGElement>(null);

  useEffect(() => {
    if (celebrationKey === priorCelebration.current) return;
    priorCelebration.current = celebrationKey;
    if (celebrationKey <= 0) return;
    setCelebrating(true);
    const timer = window.setTimeout(() => setCelebrating(false), 2650);
    return () => window.clearTimeout(timer);
  }, [celebrationKey]);

  const count = Math.max(0, Math.floor(Number.isFinite(notificationCount) ? notificationCount : 0));
  useEffect(() => {
    const previous = priorNotificationCount.current;
    priorNotificationCount.current = count;
    if (count > 0) {
      // A new notification supersedes an unfinished throw, avoiding an
      // invisible or incorrect number on the fresh badge.
      setClearingCount(null);
      return;
    }
    if (previous <= 0) return;
    setClearingCount(previous);
    const timer = window.setTimeout(() => setClearingCount(null), 1660);
    return () => window.clearTimeout(timer);
  }, [count]);

  const isPainting = progress === 'generating_image' || progress === 'editing_image';
  const isSearching = Boolean(progress && (/^(searching_|reading_|listing_)/.test(progress) ||
    ['checking_sectors', 'analyzing_subtasks', 'analyzing_web_results', 'analyzing_retrieved_context',
      'editing_document', 'creating_document', 'generating_document', 'working_with_documents'].includes(progress)));
  // Typing belongs to Planik's answer preparation, never the human draft.
  const mode: PlanikMode = clearingCount !== null ? 'clearing'
    : celebrating ? 'celebrating'
    : busy ? (isPainting ? 'painting' : isSearching ? 'searching' : 'typing')
    : hovered ? 'hover' : 'idle';
  const badgeNumber = clearingCount ?? count;
  const badgeText = badgeNumber > 99 ? '99+' : String(badgeNumber);

  const gaze = useCallback((x: number, y: number) => {
    const transform = `translate(${x.toFixed(1)} ${y.toFixed(1)})`;
    leftEye.current?.setAttribute('transform', transform);
    rightEye.current?.setAttribute('transform', transform);
    // During a shy greeting both hands reach gently toward the pointer.
    leftHand.current?.setAttribute('transform', `translate(${(x * 0.8).toFixed(1)} ${(y * 0.7).toFixed(1)})`);
    rightHand.current?.setAttribute('transform', `translate(${(x * 0.8).toFixed(1)} ${(y * 0.7).toFixed(1)})`);
  }, []);

  useEffect(() => {
    if (mode === 'searching') gaze(-9, 5);
    else if (mode === 'typing') gaze(0, 7);
    else if (mode === 'painting') gaze(-6, 4);
    else if (mode === 'clearing') gaze(-5, 1);
    else if (mode !== 'hover') gaze(0, 0);
  }, [mode]);

  // Follow the cursor anywhere in the working area, including empty space
  // and modal surfaces. Only the eyes move while idle; the reaching-hands
  // animation still needs a pointer directly over Planik.
  // One rAF per pointer frame avoids React rerenders on every move.
  useEffect(() => {
    if (mode !== 'idle' && mode !== 'hover') return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;
    const update = () => {
      frame = 0;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect?.width || !rect.height) return;
      const x = Math.max(-5, Math.min(5, (pointerX - (rect.left + rect.width / 2)) / rect.width * 12));
      const y = Math.max(-4, Math.min(4, (pointerY - (rect.top + rect.height / 2)) / rect.height * 10));
      gaze(x, y);
    };
    const onPointerMove = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    document.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [mode, gaze]);

  return (
    <span
      className={`planik-mascot planik-mascot--${size} ${className}`}
      data-mode={mode}
      data-has-notifs={count > 0 ? 'true' : 'false'}
      role="img"
      aria-label="Планик, анимированный помощник ИИ"
    >
      <span className="planik-ground-shadow" aria-hidden="true" />
      <svg
        ref={svgRef}
        className="planik-svg"
        viewBox="35 32 345 275"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        <defs>
          <linearGradient id={`planik-body-${gradientSuffix}`} x1="125" y1="75" x2="300" y2="250" gradientUnits="userSpaceOnUse">
            <stop className="planik-body-stop-start" stopColor="#5e5ca3" /><stop className="planik-body-stop-mid" offset=".55" stopColor="#373965" /><stop className="planik-body-stop-end" offset="1" stopColor="#242e51" />
          </linearGradient>
          <linearGradient id={`planik-rim-${gradientSuffix}`} x1="125" y1="75" x2="300" y2="250" gradientUnits="userSpaceOnUse">
            <stop className="planik-rim-stop-start" stopColor="#9ce4f5" /><stop className="planik-rim-stop-mid" offset=".52" stopColor="#afa8ff" /><stop className="planik-rim-stop-end" offset="1" stopColor="#7a75ca" />
          </linearGradient>
          <linearGradient id={`planik-screen-${gradientSuffix}`} x1="0" y1="0" x2="1" y2="1">
            <stop className="planik-screen-stop-start" stopColor="#212e50" /><stop className="planik-screen-stop-end" offset="1" stopColor="#141d38" />
          </linearGradient>
        </defs>

        <path d="M215 77V58" stroke="#8c8ed3" strokeWidth="7" strokeLinecap="round" />
        <circle className="planik-antenna" cx="215" cy="52" r="9" fill="#88e0ed" />
        <rect className="planik-body-surface" x="122" y="76" width="186" height="174" rx="65" fill={`url(#planik-body-${gradientSuffix})`} stroke={`url(#planik-rim-${gradientSuffix})`} strokeWidth="4" />
        <path d="M148 100Q163 83 192 83" fill="none" stroke="#d0eaff" strokeOpacity=".2" strokeLinecap="round" strokeWidth="4" />
        <rect className="planik-faceplate" x="153" y="118" width="124" height="92" rx="44" fill={`url(#planik-screen-${gradientSuffix})`} stroke="#7f81b1" strokeOpacity=".35" strokeWidth="1" />
        <g ref={leftEye}><ellipse className="planik-eye" cx="190" cy="162" rx="10" ry="15" fill="#f1f3ff" /></g>
        <g ref={rightEye}><ellipse className="planik-eye" cx="240" cy="162" rx="10" ry="15" fill="#f1f3ff" /></g>

        {/* Red notification counter sits on the upper-left edge of Planik's body.
            It is visible only while idle. The three animated copies below share
            exactly the same number when notifications are marked read. */}
        <g className="planik-notif-static">
          <circle cx="130" cy="94" r="21" fill="#f43f5e" stroke="#fff" strokeWidth="3.5" />
          <text x="130" y="101.5" textAnchor="middle" fill="#fff" fontFamily="Inter,Arial,sans-serif"
            fontWeight="800" fontSize={badgeNumber > 99 ? 15 : badgeNumber > 9 ? 19 : 22}>{badgeText}</text>
        </g>
        <g className="planik-notif-take-arm">
          <path d="M133 190Q106 178 106 151Q107 126 125 113" fill="none" stroke="#7576b9"
            strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="126" cy="112" r="10" fill="#aca6ef" />
          <path d="M120 109L117 102M129 107L134 101" stroke="#d4ceff"
            strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <g className="planik-notif-held">
            <circle cx="130" cy="94" r="21" fill="#f43f5e" stroke="#fff" strokeWidth="3.5" />
            <text x="130" y="101.5" textAnchor="middle" fill="#fff" fontFamily="Inter,Arial,sans-serif"
              fontWeight="800" fontSize={badgeNumber > 99 ? 15 : badgeNumber > 9 ? 19 : 22}>{badgeText}</text>
          </g>
        </g>
        <path className="planik-notif-whoosh" d="M72 156Q52 137 32 149M62 175Q40 172 25 183"
          stroke="#aaa9f0" strokeWidth="3" strokeDasharray="10 9" fill="none" strokeLinecap="round" />
        <g className="planik-notif-flying">
          <circle cx="130" cy="94" r="21" fill="#f43f5e" stroke="#fff" strokeWidth="3.5" />
          <text x="130" y="101.5" textAnchor="middle" fill="#fff" fontFamily="Inter,Arial,sans-serif"
            fontWeight="800" fontSize={badgeNumber > 99 ? 15 : badgeNumber > 9 ? 19 : 22}>{badgeText}</text>
        </g>

        <g className="planik-typing">
          <path d="M156 224H275L309 279H125Z" fill="#242e54" stroke="#a09de1" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M164 233H268L289 264H145Z" fill="#303d6b" />
          <g fill="#59649d">
            <rect x="162" y="238" width="18" height="7" rx="2" />
            <rect className="planik-key-a" x="185" y="238" width="18" height="7" rx="2" />
            <rect x="208" y="238" width="18" height="7" rx="2" />
            <rect x="231" y="238" width="18" height="7" rx="2" />
            <rect x="252" y="238" width="18" height="7" rx="2" />
            <rect x="154" y="251" width="18" height="7" rx="2" />
            <rect x="178" y="251" width="18" height="7" rx="2" />
            <rect x="201" y="251" width="18" height="7" rx="2" />
            <rect className="planik-key-b" x="224" y="251" width="18" height="7" rx="2" />
            <rect x="246" y="251" width="18" height="7" rx="2" />
            <rect x="178" y="267" width="92" height="6" rx="3" />
          </g>
          <g className="planik-type-left">
            <path d="M133 211Q147 224 172 244" fill="none" stroke="#7777b8" strokeWidth="16" strokeLinecap="round" />
            <circle cx="176" cy="245" r="8" fill="#aaa6f0" />
            <path d="M179 244L189 241" stroke="#c1bcff" strokeWidth="6" strokeLinecap="round" />
          </g>
          <g className="planik-type-right">
            <path d="M298 211Q282 224 264 244" fill="none" stroke="#7777b8" strokeWidth="16" strokeLinecap="round" />
            <circle cx="260" cy="245" r="8" fill="#aaa6f0" />
            <path d="M258 244L248 253" stroke="#c1bcff" strokeWidth="6" strokeLinecap="round" />
          </g>
        </g>

        <g className="planik-thinking">
          <g className="planik-scratch-arm">
            <path d="M301 188Q327 185 330 163Q335 140 309 118" fill="none" stroke="#7274b4" strokeWidth="18" strokeLinecap="round" />
            <circle cx="306" cy="116" r="10" fill="#a8a3ed" />
            <path d="M296 108L291 99M304 106V96M313 107L317 98" fill="none" stroke="#c3bfff" strokeWidth="3.5" strokeLinecap="round" />
          </g>
        </g>

        <g className="planik-searching">
          <path d="M130 190Q104 191 102 216" fill="none" stroke="#7375b2" strokeWidth="17" strokeLinecap="round" />
          <rect x="80" y="151" width="103" height="100" rx="10" fill="#484d84" stroke="#a39cf0" strokeWidth="2.5" />
          <path d="M81 168H182" stroke="#c5c0ff" strokeWidth="3" />
          <circle cx="94" cy="159" r="2.8" fill="#efa9c9" /><circle cx="104" cy="159" r="2.8" fill="#e9d689" /><circle cx="114" cy="159" r="2.8" fill="#9ce4ed" />
          <g className="planik-page-one">
            <rect x="91" y="176" width="80" height="62" rx="4" fill="#e4e8fb" />
            <rect x="99" y="184" width="25" height="18" rx="3" fill="#a2b4ef" />
            <path d="M130 186h34M130 194h28M99 210h62M99 218h55M99 226h42" stroke="#9aa5cc" strokeWidth="3" strokeLinecap="round" />
          </g>
          <g className="planik-page-two">
            <rect x="91" y="176" width="80" height="62" rx="4" fill="#f2e6ff" />
            <rect x="99" y="184" width="62" height="12" rx="3" fill="#b39ae7" />
            <path d="M99 204h63M99 213h55M99 222h48M99 230h35" stroke="#b1a6cf" strokeWidth="3" strokeLinecap="round" />
          </g>
          <g className="planik-page-three">
            <rect x="91" y="176" width="80" height="62" rx="4" fill="#e5f6fb" />
            <circle cx="116" cy="201" r="14" fill="#a1dce5" />
            <path d="M136 188h27M136 198h25M99 221h63M99 230h45" stroke="#98bfc7" strokeWidth="3" strokeLinecap="round" />
          </g>
          <circle cx="182" cy="222" r="9" fill="#a9a5ed" />
          <path d="M301 191Q279 204 249 244" fill="none" stroke="#7778b8" strokeWidth="18" strokeLinecap="round" />
          <circle cx="248" cy="243" r="9" fill="#aaa5ee" />
          <g className="planik-loupe">
            <path d="M242 240L210 215" fill="none" stroke="#9e94ef" strokeWidth="11" strokeLinecap="round" />
            <circle cx="191" cy="195" r="25" fill="#a3d8f5" fillOpacity=".2" stroke="#cac3ff" strokeWidth="7" />
            <path d="M180 187Q188 180 196 185" fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth="3" strokeLinecap="round" />
          </g>
        </g>

        <g className="planik-painting">
          {/* Planik paints on a small glowing canvas while an image tool is active. */}
          <path d="M132 200Q109 209 103 233" fill="none" stroke="#7777b8" strokeWidth="17" strokeLinecap="round" />
          <rect x="74" y="150" width="119" height="117" rx="13" fill="#454b83" stroke="#a99bff" strokeWidth="3" />
          <rect x="85" y="161" width="97" height="94" rx="7" fill="#e4eafc" />
          <circle cx="158" cy="186" r="12" fill="#f9be87" />
          <path d="M87 239L114 208L130 225L151 194L180 240Z" fill="#8dc8ce" />
          <path className="planik-paint-stroke" d="M99 189Q116 178 125 194T157 211" fill="none" stroke="#ac78e8" strokeWidth="6" strokeLinecap="round" strokeDasharray="90" />
          <path d="M301 195Q283 207 264 218" fill="none" stroke="#7778b8" strokeWidth="17" strokeLinecap="round" />
          <g className="planik-paint-brush">
            <path d="M258 214L224 200" stroke="#bf9b6b" strokeWidth="10" strokeLinecap="round" />
            <path d="M221 198L209 193L213 207L224 204Z" fill="#d4d8ff" stroke="#a99bff" strokeWidth="2" />
            <path d="M210 193Q204 195 205 203L213 207Z" fill="#a76cea" />
            <circle cx="263" cy="218" r="8" fill="#aaa5ee" />
          </g>
        </g>

        <g className="planik-celebrating">
          {/* Both arms lift a real party popper, aimed toward the left. */}
          <g className="planik-celebrate-rig">
            <path d="M132 207Q146 235 173 224" fill="none" stroke="#7272b3" strokeWidth="19" strokeLinecap="round" />
            <path d="M301 208Q281 237 258 230" fill="none" stroke="#7272b3" strokeWidth="19" strokeLinecap="round" />
            <path d="M118 132Q103 140 104 163Q105 179 119 190L258 237Q273 232 267 219Z" fill="#8569d0" stroke="#c5a8ff" strokeWidth="3" />
            <path d="M145 140L171 151L202 217L178 207Z" fill="#f5cd70" />
            <path d="M198 176L219 190L241 231L223 224Z" fill="#f5cd70" />
            <path d="M125 145L245 223" stroke="#e9ddff" strokeOpacity=".25" strokeWidth="4" fill="none" />
            <ellipse cx="112" cy="161" rx="15" ry="29" transform="rotate(18 112 161)" fill="#9870e9" stroke="#ded0ff" strokeWidth="3" />
            <ellipse cx="112" cy="161" rx="10" ry="22" transform="rotate(18 112 161)" fill="#292149" />
            <circle cx="173" cy="224" r="11" fill="#a6a0ef" />
            <circle cx="258" cy="230" r="11" fill="#a6a0ef" />
          </g>
          {/* Flash and confetti share the same CSS delay: exactly one firing event. */}
          <g className="planik-popper-flash">
            <path d="M105 125L115 146L138 157L115 168L105 193L96 168L73 157L96 146Z" fill="#ffe493" />
            <circle cx="105" cy="157" r="7" fill="#fffdf0" />
          </g>
          <g className="planik-confetti-burst">
            {POPPER_CONFETTI.map((piece, index) => (
              <rect
                key={index}
                className="planik-popper-particle"
                x="101" y="155"
                width={index % 4 === 0 ? 12 : 6}
                height={index % 4 === 0 ? 4 : 8}
                rx="2"
                fill={piece.color}
                style={{
                  '--planik-dx': piece.dx + 'px',
                  '--planik-dy': piece.dy + 'px',
                  '--planik-rotate': piece.rotate + 'deg',
                  '--planik-stagger': piece.delay + 's'
                } as CSSProperties}
              />
            ))}
          </g>
        </g>

        <g className="planik-hover">
          <g className="planik-hover-left"><g ref={leftHand}>
            <path d="M129 194Q141 219 170 224" fill="none" stroke="#7777b8" strokeWidth="17" strokeLinecap="round" />
            <circle cx="170" cy="224" r="10" fill="#b2aaff" />
          </g></g>
          <g className="planik-hover-right"><g ref={rightHand}>
            <path d="M303 194Q283 218 254 225" fill="none" stroke="#7777b8" strokeWidth="17" strokeLinecap="round" />
            <circle cx="254" cy="225" r="10" fill="#b2aaff" />
          </g></g>
        </g>
      </svg>
    </span>
  );
});
