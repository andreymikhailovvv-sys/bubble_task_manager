import { useEffect, useState } from 'react';
import { PlanikMascot, type PlanikMode } from './PlanikMascot';

const modes = ['idle','hover','thinking','typing','searching','painting','celebrating','clearing','income','expense','telegram-send','mail-send'] as const;
type Mode = Exclude<PlanikMode,'showcase'>;
const normalizeMode = (value: unknown): Mode => modes.includes(value as Mode) ? value as Mode : 'idle';
const skins = ['classic','cat','northern','maestro','zoomer','pirate','wizard','ninja','space','banker','king'];

export default function AndroidMascotSurface() {
  const params = new URLSearchParams(location.search);
  const skinId = skins.includes(params.get('skin') ?? '') ? params.get('skin')! : 'classic';
  const [mode,setMode] = useState<Mode>(() => normalizeMode(params.get('mode')));
  useEffect(() => {
    document.documentElement.classList.remove('web-workspace-preload','work-workspace-preload');
    document.body.dataset.theme = params.get('theme') === 'dark' ? 'dark' : 'light';
    const listener = (event: Event) => setMode(normalizeMode((event as CustomEvent).detail));
    window.addEventListener('planik-native-mode',listener);
    let frame = 0;
    const markReady = () => {
      // Native WebViews cannot paint outside their viewport. Reserve space
      // for animated accessories, arms and effects on all four sides.
      const svg = document.querySelector('.android-mascot-artwork .planik-svg');
      svg?.setAttribute('viewBox', '-10 -30 450 365');
      const body = document.querySelector('.android-mascot-artwork .planik-body-surface');
      const bounds = body?.getBoundingClientRect();
      if (bounds && bounds.width > 0 && bounds.height > 0) {
        document.documentElement.dataset.androidMascotReady = 'true';
      } else frame = requestAnimationFrame(markReady);
    };
    frame = requestAnimationFrame(() => { frame = requestAnimationFrame(markReady); });
    return () => { cancelAnimationFrame(frame); window.removeEventListener('planik-native-mode',listener); delete document.documentElement.dataset.androidMascotReady; };
  },[]);
  return <><style>{'html,body,#root{margin:0!important;padding:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:transparent!important} #root{display:grid;place-items:center} .android-mascot-artwork{display:block;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important} .android-mascot-artwork .planik-svg{width:100%;height:100%}'}</style>
    <PlanikMascot className="android-mascot-artwork" skinId={skinId} variant={params.get('variant')==='economic'?'economic':'planner'} previewMode={mode} arrivalKey={1} size="composer"/>
  </>;
}
