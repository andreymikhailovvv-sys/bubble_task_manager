import {useEffect,useRef,useState} from 'react';
import {SubtaskCommentsDialog,type SharedSubtaskComment} from './components/SubtaskCommentsDialog';
import {api,type WorkSubtask,type WorkSubtaskComment,type WorkWorkspace} from './lib/api';

/** Corporate data adapter for the exact personal planner comment window. */
export default function WorkSubtaskCommentsDialog({organizationId,projectId,taskId,subtask,workspace,onClose,onCountChange}:{
 organizationId:string;projectId:string;taskId:string;subtask:WorkSubtask;
 workspace:WorkWorkspace;onClose:()=>void;onCountChange:(count:number)=>void;
}){
 const [comments,setComments]=useState<WorkSubtaskComment[]>([]);
 const [loading,setLoading]=useState(true),[sending,setSending]=useState(false);
 const [draft,setDraft]=useState(''),[replyId,setReplyId]=useState<string|null>(null),[error,setError]=useState<string|null>(null);
 const scrollRef=useRef<HTMLDivElement|null>(null);
 const fetchComments=async()=>{
   const result=await api.workSubtaskComments(organizationId,projectId,taskId,subtask.id);
   setComments(result.comments);onCountChange(result.comments.length);
 };
 useEffect(()=>{
   let live=true;setLoading(true);
   void api.workSubtaskComments(organizationId,projectId,taskId,subtask.id)
     .then(result=>{if(live){setComments(result.comments);onCountChange(result.comments.length);}})
     .catch(e=>{if(live)setError(e instanceof Error?e.message:'Не удалось загрузить комментарии');})
     .finally(()=>{if(live)setLoading(false);});
   return()=>{live=false;};
 },[organizationId,projectId,taskId,subtask.id]);
 useEffect(()=>{scrollRef.current?.scrollTo({top:scrollRef.current.scrollHeight});},[comments.length]);
 const mapped:SharedSubtaskComment[]=comments.map(comment=>{
   const member=workspace.members.find(m=>m.id===comment.authorMemberId);
   return {id:comment.id,content:comment.content,createdAt:comment.createdAt,parentCommentId:comment.parentCommentId,
     authorName:member?.name||member?.username||comment.author.user?.name||comment.author.user?.username||'Участник',
     authorColor:['OWNER','ADMIN','MANAGER'].includes(member?.role||comment.author.role)?'#8b5cf6':'#079bb4'};
 });
 const replyTo=mapped.find(c=>c.id===replyId)||null;
 const send=async()=>{
   if(sending||!draft.trim())return;setSending(true);setError(null);
   try{
     await api.workPostSubtaskComment(organizationId,projectId,taskId,subtask.id,draft.trim(),replyId);
     setDraft('');setReplyId(null);await fetchComments();
   }catch(e){setError(e instanceof Error?e.message:'Не удалось отправить комментарий');}
   finally{setSending(false);}
 };
 return <SubtaskCommentsDialog title={subtask.title} comments={mapped}
   loading={loading} sending={sending} error={error} draft={draft} replyTo={replyTo}
   onDraftChange={setDraft} onReply={c=>setReplyId(c.id)}
   onDismissReply={()=>setReplyId(null)} onClose={onClose}
   onSend={()=>void send()} scrollRef={scrollRef}/>;
}
