import { randomUUID } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { runDynamicResponsesCall, refundDynamicResponsesCall, settleDynamicResponsesCall } from './dynamic-responses-billing.service.js';
import { getOfficeDocumentPreview, applyOfficeEdits, type OfficeEdit, type OfficeFormat } from './ooxml-document-editor.js';
import { WORD_DOCUMENT_MIME } from './word-document.service.js';
import { EXCEL_MIME } from './excel-workbook.service.js';

type Attachment = { name: string; mimeType: string; contentBase64: string; size: number };
type Input = {
  userId: string; taskId?: string; question: string; model: string; apiKey: string;
  attachments?: Attachment[]; sourceDocumentId?: string;
  onProgress?: (status:'editing_document'|'forming_answer')=>void;
};

export function isDocumentEditRequest(question:string) {
  const q=question.trim().toLowerCase();
  if(!q || q.length>5000)return false;
  if(/\b(?:создай|сгенерируй|подготовь)\s+(?:новый\s+)?(?:word|excel|документ|таблиц)/i.test(q))return false;
  if (/(?:задач|подзадач|напоминан|дедлайн|сектор|событи|календар|рейтинг)/i.test(q) && !/(?:word|excel|docx|xlsx|таблиц|документ|файл|абзац|ячейк|столбц|строк)/i.test(q)) return false;
  return /(?:измен|исправ|отредактир|поправ|замен|переимен|обнов|удал|убер|добав|дополн|перепиш|сократ|встав|формул|столбц|строк|ячейк|пункт\s+\d|абзац|сортир)/i.test(q);
}
const sourceFormat=(name:string,mime:string):OfficeFormat|null=>
  /\.docx$/i.test(name) && [WORD_DOCUMENT_MIME,'application/octet-stream',''].includes(mime)?'docx':
  /\.xlsx$/i.test(name) && [EXCEL_MIME,'application/octet-stream',''].includes(mime)?'xlsx':null;

function uploadBuffer(file:Attachment) {
  if(typeof file.contentBase64!=='string'||file.contentBase64.length>11_200_000 ||
     !/^[A-Za-z0-9+/]+={0,2}$/.test(file.contentBase64))
    throw new TypeError('Файл повреждён или превышает лимит 8 МБ.');
  const buffer=Buffer.from(file.contentBase64,'base64');
  if(buffer.length>8*1024*1024||buffer.length<100||buffer.length!==file.size)
    throw new TypeError('Файл повреждён или превышает лимит 8 МБ.');
  return buffer;
}

const planSchema={
  type:'object',additionalProperties:false,required:['summary','edits'],
  properties:{
    summary:{type:'string'},
    edits:{type:'array',maxItems:20,items:{
      type:'object',additionalProperties:false,
      required:['kind','target','value','sheet','valueType'],
      properties:{
        kind:{type:'string',enum:['replace_text','append_paragraph','delete_paragraph','set_cell']},
        target:{type:'string'}, value:{type:'string'},sheet:{type:'string'},
        valueType:{type:'string',enum:['text','number','formula','boolean','blank']}
      }
    }}
  }
};

function extractText(response: {output_text?:unknown;output?:unknown}):string {
  if(typeof response.output_text==='string' && response.output_text.trim())return response.output_text.trim();
  const items=Array.isArray(response.output)?response.output:[];
  return items.flatMap((item)=>{
    if(!item||typeof item!=='object'||!Array.isArray((item as {content?:unknown}).content))return [];
    return (item as {content:Array<{text?:unknown}>}).content.map(x=>typeof x.text==='string'?x.text:'');
  }).join('').trim();
}

export async function editUserDocumentIfRequested(input:Input) {
  if(!isDocumentEditRequest(input.question))return null;
  const attachments=input.attachments ?? [];
  const candidates=attachments.filter(a=>sourceFormat(a.name,a.mimeType));
  if(candidates.length>1)throw new TypeError('Прикреплено несколько Word/Excel файлов. Оставьте один для редактирования.');
  let format:OfficeFormat|null=null;
  let sourceBuffer:Buffer|null=null;
  let sourceName='';
  if(candidates.length){
    const file=candidates[0];
    format=sourceFormat(file.name,file.mimeType);
    sourceBuffer=uploadBuffer(file);
    sourceName=file.name;
  }else{
    const fromHistory=input.sourceDocumentId ? await prisma.aiGeneratedDocument.findFirst({
      where:{id:input.sourceDocumentId,userId:input.userId,mimeType:{in:[WORD_DOCUMENT_MIME,EXCEL_MIME]}},
      select:{id:true,fileName:true,mimeType:true,contentBase64:true,size:true}
    }):null;
    const previous=fromHistory ?? (input.taskId ? await prisma.aiGeneratedDocument.findFirst({
      where:{userId:input.userId,taskId:input.taskId,mimeType:{in:[WORD_DOCUMENT_MIME,EXCEL_MIME]}},
      orderBy:{createdAt:'desc'},select:{id:true,fileName:true,mimeType:true,contentBase64:true,size:true}
    }):null);
    if(!previous)return null;
    format=previous.mimeType===WORD_DOCUMENT_MIME?'docx':'xlsx';
    sourceName=previous.fileName;
    sourceBuffer=uploadBuffer({name:previous.fileName,mimeType:previous.mimeType,size:previous.size,contentBase64:previous.contentBase64});
  }
  if(!format || !sourceBuffer)return null;
  const preview=getOfficeDocumentPreview(sourceBuffer,format);
  if(preview.text.length<3)throw new TypeError('Не удалось извлечь содержимое документа для безопасного редактирования.');
  const actionId=randomUUID();
  input.onProgress?.('editing_document');
  const instruction=format==='docx'
    ? 'Разрешены только replace_text (заменить точный фрагмент в одном абзаце), append_paragraph (добавить абзац в конец), delete_paragraph (удалить абзац строго по полному тексту). Для replace_text укажи в target точный текст из preview. Сложные стили, таблицы и перемещение элементов не поддерживаются. Для Word поля sheet оставляй пустыми, valueType=text.'
    : 'Разрешён только set_cell: sheet=точное имя листа, target=адрес A1, value=новое значение, valueType=text|number|formula|boolean|blank. Формулы начинаются со знака =. Не меняй ячейки, которые пользователь не просил менять. Не удаляй или не сортируй строки физически: это может нарушить формулы.';
  const call=await runDynamicResponsesCall({
    userId:input.userId,actionId,providerCallIndex:1,
    feature:input.taskId?'task_chat':'ai_chat',apiKey:input.apiKey,
    payload:{
      model:input.model,
      input:[
        {role:'system',content:'Ты редактор существующего офисного файла. Возвращай строго JSON правок по схеме. Не создавай файл с нуля. Не меняй не запрошенное. Если операция не поддерживается или контекст недостаточен, edits=[] и в summary объясни причину. '+instruction},
        {role:'user',content:'Запрос: '+input.question.slice(0,5000)+'\nФайл: '+sourceName+'\nТочные данные исходного файла:\n'+preview.text}
      ],
      text:{format:{type:'json_schema',name:'office_edits',strict:true,schema:planSchema}},
      tool_choice:'none'
    },stream:false
  });
  let settled=false;
  try{
    const text=extractText(call.responseJson);
    if(!text)throw new TypeError('ИИ не вернул инструкции по редактированию.');
    const data=JSON.parse(text) as {summary?:unknown;edits?:unknown};
    const edits=data.edits as OfficeEdit[];
    if(!Array.isArray(edits) || edits.length===0){
      throw new TypeError(typeof data.summary==='string'&&data.summary.length<400
        ? 'Файл не изменён: '+data.summary : 'ИИ не сформировал безопасных изменений для этого файла.');
    }
    const newBuffer=applyOfficeEdits(sourceBuffer,format,edits);
    const fileName=(sourceName.replace(/\.(docx|xlsx)$/i,'').replace(/[\\/:*?"<>|]/g,'_').slice(0,140)||'edited')
      +'-edited.'+format;
    const document=await prisma.aiGeneratedDocument.create({
      data:{userId:input.userId,taskId:input.taskId ?? null,fileName,
        mimeType:format==='docx'?WORD_DOCUMENT_MIME:EXCEL_MIME,
        size:newBuffer.length,contentBase64:newBuffer.toString('base64')},
      select:{id:true,fileName:true,mimeType:true,size:true}
    });
    const charge=await settleDynamicResponsesCall(call);
    settled=true;
    return{
      answer:'Файл изменён. '+(typeof data.summary==='string'?data.summary.slice(0,700):'')+' Новая версия прикреплена к сообщению.',
      model:input.model,generatedDocument:document,taskDataChanged:false,
      actionReports:[] as string[],undoOperations:[] as unknown[],
      webSearchUsed:false,webSources:[],webCitations:[],imageCreditsSpentMilli:0,
      billing:{mode:'dynamic' as const,creditsSpentMilli:charge.chargedMilli},
      diagnostics:undefined,
      workflowDiagnostics:{providerStreaming:false,webSearchProgressObserved:false,providerCalls:1,
        toolCalls:1,toolOperations:['edit_document'],inputTokensTotal:0,outputTokensTotal:0,
        webSearchUsed:false,webSearchCallsActual:0,webSearchCallsBilled:0,webSearchLimit:1,
        webSearchLimitExceeded:false,webSearchDuplicateItems:0,webSearchSearchItemsRaw:0,
        webSearchCreditsMilliBilled:0,providerWebSearchCostMilli:0,webSearchCalls:0,
        webSearchCreditsMilli:0,webSourceCount:0}
    };
  }catch(error){
    if(!settled)await refundDynamicResponsesCall(call).catch(()=>undefined);
    throw error;
  }finally{input.onProgress?.('forming_answer');}
}
