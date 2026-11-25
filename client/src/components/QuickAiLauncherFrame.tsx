import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  onHoverChange?: (hovered: boolean) => void;
  onFocus?: () => void;
  taskOpen?: boolean;
  work?: boolean;
  fullscreenBubbles?: boolean;
  embeddedTaskFocus?: boolean;
  managedMascot?: boolean;
  modalMascot?: boolean;
  embeddedChatTarget?: HTMLElement | null;
};

/**
 * Shared personal/Work quick-AI hover boundary.
 * The popup and the launcher are siblings inside the SAME positioned hover
 * region, exactly as in the original personal planner App.tsx. Moving the
 * cursor upward therefore keeps the original group hovered.
 */
export function QuickAiLauncherFrame({children,onHoverChange,onFocus,taskOpen=false,work=false,fullscreenBubbles=false,embeddedTaskFocus=false,managedMascot=false,modalMascot=false,embeddedChatTarget}:Props){
  const launcher = useRef<HTMLDivElement>(null);
  const [hovered,setHovered] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const enter = () => {window.clearTimeout(closeTimer.current);if (!hovered) {setHovered(true);onHoverChange?.(true);}};
  const leave = () => {window.clearTimeout(closeTimer.current);closeTimer.current=window.setTimeout(() => {setHovered(false);onHoverChange?.(false);},300);};
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  // The old composer avatar occupied this exact anchor. Keep the one live
  // launcher there when the chat is an embedded pane, including after resize.
  useLayoutEffect(() => {
    const root = launcher.current;
    if (!root || !embeddedChatTarget || modalMascot) return;
    let frame = 0;
    let composer: HTMLElement | null = null;
    let main: HTMLElement | null = null;
    const observer = new ResizeObserver(() => schedule());
    const update = () => {
      frame = 0;
      const nextComposer = embeddedChatTarget.querySelector<HTMLElement>('.ai-chat-expanded-composer-wrap');
      const nextMain = embeddedChatTarget.querySelector<HTMLElement>('.ai-chat-expanded-main');
      if (nextComposer !== composer || nextMain !== main) {
        if (composer) observer.unobserve(composer);
        if (main) observer.unobserve(main);
        composer = nextComposer; main = nextMain;
        if (composer) observer.observe(composer);
        if (main) observer.observe(main);
      }
      if (!composer || !main) return;
      const rect = main.getBoundingClientRect();
      const input = composer.getBoundingClientRect();
      root.style.setProperty('--mascot-chat-right', Math.max(8, window.innerWidth-rect.right+4)+'px');
      root.style.setProperty('--mascot-chat-bottom', Math.max(8, window.innerHeight-input.top+4)+'px');
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    observer.observe(embeddedChatTarget);
    const mount = new MutationObserver(schedule);
    mount.observe(embeddedChatTarget,{childList:true,subtree:true});
    window.addEventListener('resize',schedule);
    update();
    return () => { observer.disconnect(); mount.disconnect(); window.removeEventListener('resize',schedule); if (frame) cancelAnimationFrame(frame); root.style.removeProperty('--mascot-chat-right'); root.style.removeProperty('--mascot-chat-bottom'); };
  }, [embeddedChatTarget, modalMascot]);
  return <div ref={launcher}
    data-quick-hover={hovered}
    data-mascot-chat-embedded={embeddedChatTarget && !modalMascot ? 'true' : undefined}
    data-managed-mascot-launcher={managedMascot ? 'planner' : undefined}
    data-mascot-surface={modalMascot ? 'modal' : 'workspace'}
    className={`ai-chat-launcher group fixed bottom-8 right-6 z-[95] ${work?'work-ai-launcher':'lg:right-[360px]'} ${taskOpen?'ai-chat-launcher-task-open':''} ${fullscreenBubbles?'bubble-ai-fullscreen':''} ${embeddedTaskFocus?'ai-chat-launcher-task-embedded':''}`}
    onMouseEnter={enter}
    onMouseLeave={leave}
    onFocus={onFocus}
  >{children}</div>;
}
