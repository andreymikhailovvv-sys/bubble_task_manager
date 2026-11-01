import {serializeAiReply,type AiReplyTarget} from './AiMessageReply';

/** Company AI has a strict 3,000-character question limit. Preserve the
 * personal planner's reply chip and protocol, while bounding the quote so
 * a long AI message cannot make an otherwise valid reply fail validation. */
export function serializeWorkAiReply(question:string,reply:AiReplyTarget|null):string{
  if(!reply)return question;
  const maxQuote=Math.max(0,2700-question.length-250);
  if(maxQuote<60)return question;
  const candidate=serializeAiReply(question,{...reply,content:reply.content.slice(0,Math.min(850,maxQuote)),fileNames:reply.fileNames.slice(0,3)});
  return candidate.length<=3000?candidate:question;
}
