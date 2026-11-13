import { type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  onHoverChange?: (hovered: boolean) => void;
  onFocus?: () => void;
  taskOpen?: boolean;
  work?: boolean;
  fullscreenBubbles?: boolean;
  embeddedTaskFocus?: boolean;
};

/**
 * Shared personal/Work quick-AI hover boundary.
 * The popup and the launcher are siblings inside the SAME positioned hover
 * region, exactly as in the original personal planner App.tsx. Moving the
 * cursor upward therefore keeps the original group hovered.
 */
export function QuickAiLauncherFrame({children,onHoverChange,onFocus,taskOpen=false,work=false,fullscreenBubbles=false,embeddedTaskFocus=false}:Props){
  return <div
    className={`ai-chat-launcher group fixed bottom-8 right-6 z-[95] ${work?'work-ai-launcher':'lg:right-[360px]'} ${taskOpen?'ai-chat-launcher-task-open':''} ${fullscreenBubbles?'bubble-ai-fullscreen':''} ${embeddedTaskFocus?'ai-chat-launcher-task-embedded':''}`}
    onMouseEnter={()=>onHoverChange?.(true)}
    onMouseLeave={()=>onHoverChange?.(false)}
    onFocus={onFocus}
  >{children}</div>;
}
