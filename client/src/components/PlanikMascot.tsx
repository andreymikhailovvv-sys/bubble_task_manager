import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import './PlanikMascot.css';

type PlanikMode = 'idle' | 'hover' | 'typing' | 'thinking' | 'searching' | 'celebrating';

type Props = {
  notificationCount?: number;
  typingText?: string;
  busy?: boolean;
  progress?: string | null;
  celebrationKey?: number;
  size?: 'launcher' | 'composer';
  className?: string;
};

/**
 * The website's shared, lightweight Planik mascot.
 * It is deliberately independent of task/chat API calls: parent components
 * provide the existing notification, draft, progress and completion signals.
 */
export function PlanikMascot({
  notificationCount = 0,
  typingText = '',
  busy = false,
  progress,
  celebrationKey = 0,
  size = 'launcher',
  className = ''
}: Props) {
  const gradientSuffix = useId().replace(/:/g, '');
  const [typing, setTyping] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const priorDraft = useRef(typingText);
  const priorCelebration = useRef(celebrationKey);
  const leftEye = useRef<SVGGElement>(null);
  const rightEye = useRef<SVGGElement>(null);
  const leftHand = useRef<SVGGElement>(null);
  const rightHand = useRef<SVGGElement>(null);

  // Show typing only while text is actually being entered, not indefinitely
  // for a nonempty draft the user left on screen.
  useEffect(() => {
    if (priorDraft.current === typingText) return;
    priorDraft.current = typingText;
    if (!typingText.trim()) { setTyping(false); return; }
    setTyping(true);
    const timer = window.setTimeout(() => setTyping(false), 1000);
    return () => window.clearTimeout(timer);
  }, [typingText]);

  useEffect(() => {
    if (celebrationKey === priorCelebration.current) return;
    priorCelebration.current = celebrationKey;
    if (celebrationKey <= 0) return;
    setCelebrating(true);
    const timer = window.setTimeout(() => setCelebrating(false), 2650);
    return () => window.clearTimeout(timer);
  }, [celebrationKey]);

  const isSearching = progress === 'searching_web' || progress === 'analyzing_web_results';
  const mode: PlanikMode = celebrating ? 'celebrating'
    : busy ? (isSearching ? 'searching' : 'thinking')
    : typing ? 'typing'
    : hovered ? 'hover' : 'idle';
  const count = Math.max(0, Math.floor(Number.isFinite(notificationCount) ? notificationCount : 0));
  const badgeText = count > 99 ? '99+' : String(count);

  const gaze = (x: number, y: number) => {
    const transform = `translate(${x.toFixed(1)} ${y.toFixed(1)})`;
    leftEye.current?.setAttribute('transform', transform);
    rightEye.current?.setAttribute('transform', transform);
    // During a shy greeting both hands reach gently toward the pointer.
    leftHand.current?.setAttribute('transform', `translate(${(x * 0.8).toFixed(1)} ${(y * 0.7).toFixed(1)})`);
    rightHand.current?.setAttribute('transform', `translate(${(x * 0.8).toFixed(1)} ${(y * 0.7).toFixed(1)})`);
  };

  useEffect(() => {
    if (mode === 'searching') gaze(-9, 5);
    else if (mode === 'typing') gaze(0, 7);
    else if (mode === 'thinking') gaze(7, -4);
    else if (mode !== 'hover') gaze(0, 0);
  }, [mode]);

  const followPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (mode !== 'hover' && mode !== 'idle') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(-5, Math.min(5, (event.clientX - rect.left - rect.width * .49) / Math.max(1, rect.width) * 16));
    const y = Math.max(-4, Math.min(4, (event.clientY - rect.top - rect.height * .52) / Math.max(1, rect.height) * 13));
    gaze(x, y);
  };

  return (
    <span
      className={`planik-mascot planik-mascot--${size} ${className}`}
      data-mode={mode}
      data-has-notifs={count > 0 ? 'true' : 'false'}
      role="img"
      aria-label="Планик, анимированный помощник ИИ"
    >
      <svg
        className="planik-svg"
        viewBox={mode === 'celebrating' ? '90 32 360 275' : '50 32 345 275'}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        onPointerEnter={() => setHovered(true)}
        onPointerMove={followPointer}
        onPointerLeave={() => { setHovered(false); gaze(0, 0); }}
      >
        <defs>
          <linearGradient id={`planik-body-${gradientSuffix}`} x1="125" y1="75" x2="300" y2="250" gradientUnits="userSpaceOnUse">
            <stop stopColor="#5e5ca3" /><stop offset=".55" stopColor="#373965" /><stop offset="1" stopColor="#242e51" />
          </linearGradient>
          <linearGradient id={`planik-rim-${gradientSuffix}`} x1="125" y1="75" x2="300" y2="250" gradientUnits="userSpaceOnUse">
            <stop stopColor="#9ce4f5" /><stop offset=".52" stopColor="#afa8ff" /><stop offset="1" stopColor="#7a75ca" />
          </linearGradient>
          <linearGradient id={`planik-screen-${gradientSuffix}`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#212e50" /><stop offset="1" stopColor="#141d38" />
          </linearGradient>
        </defs>

        <ellipse cx="215" cy="290" rx="93" ry="10" fill="#02091b" opacity=".3" />

        <g className="planik-phone">
          <path d="M136 184Q119 185 100 191" fill="none" stroke="#5e619b" strokeWidth="19" strokeLinecap="round" />
          <circle cx="101" cy="190" r="10" fill="#a49eea" />
          <rect x="65" y="136" width="43" height="76" rx="10" fill="#12182e" stroke="#a39deb" strokeWidth="3" />
          <rect x="71" y="144" width="31" height="60" rx="6" fill="#27335d" />
          <path d="M86.5 157C80 157 78 162 78 168v4l-3 5h23l-3-5v-4c0-6-2-11-8.5-11zM83 182q3.5 5 7 0" fill="none" stroke="#e4e6ff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="87" cy="151" r="1.4" fill="#939ac3" />
          <circle cx="103" cy="141" r="13" fill="#f43f5e" stroke="#fff" strokeWidth="2.5" />
          <text x="103" y="144.3" textAnchor="middle" fill="#fff" fontFamily="Inter,Arial,sans-serif" fontWeight="700" fontSize={count > 99 ? 8.4 : 10}>{badgeText}</text>
        </g>

        <path d="M215 77V58" stroke="#8c8ed3" strokeWidth="7" strokeLinecap="round" />
        <circle className="planik-antenna" cx="215" cy="52" r="9" fill="#88e0ed" />
        <rect x="122" y="76" width="186" height="174" rx="65" fill={`url(#planik-body-${gradientSuffix})`} stroke={`url(#planik-rim-${gradientSuffix})`} strokeWidth="4" />
        <path d="M148 100Q163 83 192 83" fill="none" stroke="#d0eaff" strokeOpacity=".2" strokeLinecap="round" strokeWidth="4" />
        <rect x="153" y="118" width="124" height="92" rx="44" fill={`url(#planik-screen-${gradientSuffix})`} stroke="#7f81b1" strokeOpacity=".35" strokeWidth="1" />
        <g ref={leftEye}><ellipse className="planik-eye" cx="190" cy="162" rx="8" ry="12" fill="#f1f3ff" /></g>
        <g ref={rightEye}><ellipse className="planik-eye" cx="240" cy="162" rx="8" ry="12" fill="#f1f3ff" /></g>

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

        <g className="planik-celebrating">
          <g className="planik-celebrate-rig">
            <path d="M301 183Q335 178 348 129" fill="none" stroke="#7272b3" strokeWidth="19" strokeLinecap="round" />
            <circle cx="348" cy="130" r="10" fill="#b3aef6" />
            <path d="M348 130V104" fill="none" stroke="#8e7cab" strokeWidth="6" strokeLinecap="round" />
            <rect x="290" y="57" width="140" height="52" rx="12" fill="#f4de9b" stroke="#fff5d1" strokeWidth="3" />
            <text x="360" y="89" textAnchor="middle" fill="#62481d" fontSize="15" fontFamily="Inter,Arial,sans-serif" fontWeight="800">МОЛОДЕЦ!</text>
          </g>
        </g>

        <g className="planik-hover">
          <g className="planik-hover-left" ref={leftHand}>
            <path d="M129 194Q141 219 170 224" fill="none" stroke="#7777b8" strokeWidth="17" strokeLinecap="round" />
            <circle cx="170" cy="224" r="10" fill="#b2aaff" />
          </g>
          <g className="planik-hover-right" ref={rightHand}>
            <path d="M303 194Q283 218 254 225" fill="none" stroke="#7777b8" strokeWidth="17" strokeLinecap="round" />
            <circle cx="254" cy="225" r="10" fill="#b2aaff" />
          </g>
        </g>
      </svg>
    </span>
  );
}
