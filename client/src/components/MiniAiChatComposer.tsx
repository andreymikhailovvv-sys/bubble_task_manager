import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Paperclip, SendHorizontal } from 'lucide-react';
import { AutoGrowingTextarea } from './AutoGrowingTextarea';

export type MiniAiChatComposerHandle = {
  clearDraft: () => void;
  restoreIfEmpty: (text: string) => void;
};

type MiniAiChatComposerProps = {
  variant: 'general' | 'task';
  initialDraft: string;
  onDraftChange: (text: string) => void;
  onSend: () => void;
  onAttach: () => void;
  isSending: boolean;
  hasPendingFiles: boolean;
  attachDisabled?: boolean;
  attachTitle?: string;
};

/**
 * Keep each keystroke inside the composer. MiniApp contains the task list,
 * timeline and entire chat transcript, none of which should render on typing.
 * The parent keeps a mutable draft ref for send/error recovery and for
 * preserving an unsent draft when a chat dialog is temporarily closed.
 */
export const MiniAiChatComposer = forwardRef<MiniAiChatComposerHandle, MiniAiChatComposerProps>(
  function MiniAiChatComposer({
    variant, initialDraft, onDraftChange, onSend, onAttach,
    isSending, hasPendingFiles, attachDisabled, attachTitle
  }, ref) {
    const [draft, setDraft] = useState(initialDraft);
    const draftRef = useRef(initialDraft);

    const changeDraft = (value: string) => {
      draftRef.current = value;
      onDraftChange(value);
      setDraft(value);
    };

    useImperativeHandle(ref, () => ({
      clearDraft: () => changeDraft(''),
      restoreIfEmpty: (text: string) => {
        if (!draftRef.current.trim()) changeDraft(text);
      }
    }));

    return (
      <>
        <AutoGrowingTextarea
          value={draft}
          onChange={(event) => changeDraft(event.target.value)}
          placeholder="Напишите сообщение…"
          style={variant === 'task' ? { WebkitTapHighlightColor: 'transparent' } : undefined}
          className="miniapp-ai-chat-input max-h-32 min-h-11 flex-1 resize-none rounded-2xl border-0 bg-transparent px-3 py-2.5 text-sm leading-6 focus:outline-none focus:ring-0"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              onSend();
            }
          }}
        />
        <button
          type="button"
          className={variant === 'task'
            ? 'miniapp-ai-chat-attach flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40'
            : 'miniapp-ai-chat-attach flex h-11 w-11 shrink-0 items-center justify-center rounded-full'}
          disabled={attachDisabled}
          onClick={onAttach}
          aria-label="Прикрепить файл"
          title={attachTitle}
        >
          <Paperclip size={17} />
        </button>
        <button
          type="button"
          onClick={onSend}
          disabled={isSending || (!draft.trim() && !hasPendingFiles)}
          className="miniapp-ai-chat-send flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-50"
          aria-label="Отправить сообщение"
          title={variant === 'task' ? 'Отправить' : undefined}
        >
          <SendHorizontal size={17} />
        </button>
      </>
    );
  }
);
