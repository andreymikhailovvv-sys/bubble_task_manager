/** A matched pair of compact curved message action arrows. */
export function MessageActionArrow({ direction }: { direction: 'reply' | 'forward' }) {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <g transform={direction === 'reply' ? 'translate(24 0) scale(-1 1)' : undefined}>
        <path d="M3 20v-5.5C3 10.1 6.2 7.5 10.5 7.5H14" />
        <path d="m12 3 7 7-7 7" />
        {direction === 'forward' ? <path d="m8 3 7 7-7 7" /> : null}
      </g>
    </svg>
  );
}

/** Recognizable Telegram paper-plane mark, not a generic send/message icon. */
export function TelegramPlaneIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="11" fill="#229ED9" />
      <path fill="#fff" d="M18.7 6.1 5.3 11.3c-.7.28-.69.66-.1.84l3.44 1.07 1.32 4.1c.15.4.1.56.53.56.32 0 .47-.15.65-.34l1.68-1.63 3.5 2.58c.65.36 1.1.18 1.27-.6l2.22-10.52c.22-.97-.36-1.37-1.11-1.02Zm-2.05 2.05-5.85 5.28-.23 2.35-.75-2.31 6.83-5.32Z" />
    </svg>
  );
}
