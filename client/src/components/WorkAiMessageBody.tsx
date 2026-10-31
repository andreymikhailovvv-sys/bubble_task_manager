import {AiInlineMarkup} from './AiInlineMarkup';
import {renderAiContentBlocks} from './AiCodeBlocks';
import {AiReplyMessageBody} from './AiMessageReply';

/** Reuse the exact personal chat renderer (tables, fenced code, bold,
 * clickable links and reply previews) for all Work AI surfaces. */
export function WorkAiMessageBody({content}:{content:string}){
 return <AiReplyMessageBody content={content} renderBody={body=>
   renderAiContentBlocks(body,(part,key)=><div key={key} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
     <AiInlineMarkup content={part} strongClassName="ai-inline-strong"/>
   </div>)
 }/>;
}
