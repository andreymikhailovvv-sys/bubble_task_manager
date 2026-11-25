import { useEffect, useState } from 'react';
import { PlanikMascot, type PlanikMode } from './PlanikMascot';

const modes = ['idle','hover','thinking','typing','searching','painting','celebrating','clearing'] as const;
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
    document.documentElement.dataset.androidMascotReady = 'true';
    return () => { window.removeEventListener('planik-native-mode',listener); delete document.documentElement.dataset.androidMascotReady; };
  },[]);
  return <><style>{'html,body,#root{margin:0!important;padding:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:transparent!important} .android-mascot-artwork{width:100%!important;height:100%!important;max-width:none!important;max-height:none!important}'}</style>
    <PlanikMascot className="android-mascot-artwork" skinId={skinId} variant="planner" previewMode={mode} arrivalKey={1} size="composer"/>
  </>;
}
