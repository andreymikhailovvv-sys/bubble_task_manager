import { randomUUID } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { runDynamicResponsesCall, refundDynamicResponsesCall, settleDynamicResponsesCall, type DynamicResponsesCall } from './dynamic-responses-billing.service.js';
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
  if (/(?:картинк|изображен|фотограф|рисунк|пиксел|фон изображения)/i.test(q) &&
      !/(?:word|excel|docx|xlsx|таблиц|документ|файл)/i.test(q)) return false;
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
        kind:{type:'string',enum:['replace_text','append_paragraph','delete_paragraph','set_cell','delete_rows_matching']},
        target:{type:'string'}, value:{type:'string'},sheet:{type:'string'},
        valueType:{type:'string',enum:['text','number','formula','boolean','blank']}
      }
    }}
  }
};

function extractText(response: Record<string,unknown>):string {
  if(typeof response.output_text==='string' && response.output_text.trim())return response.output_text.trim();
  const items=Array.isArray(response.output)?response.output:[];
  return items.flatMap((item)=>{
    if(!item||typeof item!=='object'||!Array.isArray((item as {content?:unknown}).content))return [];
    return (item as {content:Array<{text?:unknown}>}).content.map(x=>typeof x.text==='string'?x.text:'');
  }).join('').trim();
}


export class OfficeEditPlanResponseError extends Error {
  constructor(message: string, public readonly reason: 'incomplete' | 'invalid_json' | 'empty') {
    super(message);
    this.name = 'OfficeEditPlanResponseError';
  }
}

/** Never let raw JSON.parse SyntaxError escape a structured edit request. */
export function parseOfficeEditPlanResponse(response: Record<string, unknown>): { summary?: unknown; edits?: unknown } {
  const incompleteReason = response.incomplete_details && typeof response.incomplete_details === 'object'
    ? (response.incomplete_details as { reason?: unknown }).reason : null;
  if (response.status === 'incomplete' || incompleteReason === 'max_output_tokens') {
    throw new OfficeEditPlanResponseError(
      'ИИ не успел сформировать полный план редактирования файла: достигнут лимит ответа.', 'incomplete'
    );
  }
  const text = extractText(response);
  if (!text) throw new OfficeEditPlanResponseError(
    'ИИ не вернул инструкции по редактированию файла.', 'empty'
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new OfficeEditPlanResponseError(
      'ИИ вернул неполные или некорректные инструкции редактирования файла.', 'invalid_json'
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new OfficeEditPlanResponseError('ИИ вернул некорректную структуру правок.', 'invalid_json');
  }
  return parsed as { summary?: unknown; edits?: unknown };
}

export async function editUserDocumentIfRequested(input:Input) {
  if(!isDocumentEditRequest(input.question))return null;
  if(input.taskId){
    const allowed=await prisma.task.findFirst({
      where:{id:input.taskId,OR:[
        {userId:input.userId},
        {collaboration:{members:{some:{userId:input.userId,isHidden:false}}}}
      ]},
      select:{id:true}
    });
    if(!allowed)throw new TypeError('Задача недоступна для редактирования документа.');
  }
  const attachments=input.attachments ?? [];
  // Never silently edit an older document when the current attachment
  // is an unsupported PDF/DOC/XLS or a mismatched claimed Office type.
  const officeLike=attachments.filter(a=>/\.(?:docx?|xlsx?|xlsm|pdf)$/i.test(a.name) ||
    /(?:application\/pdf|application\/msword|spreadsheet|wordprocessing)/i.test(a.mimeType));
  if(officeLike.length && officeLike.some(a=>!sourceFormat(a.name,a.mimeType))) {
    throw new TypeError('Редактирование этого вложения не поддерживается. Используйте DOCX или XLSX.');
  }
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
    : 'Excel поддерживает set_cell (sheet=точное имя листа, target=адрес A1, value=новое значение, valueType=text|number|formula|boolean|blank) и delete_rows_matching для физического удаления всех строк с указанным брендом или позицией. Для delete_rows_matching: sheet=точное имя листа, target=искомая фраза, например SEBERO, value=буквы столбца (например B) или пустая строка для поиска по всем столбцам, valueType=text. Удаление выполняется по всему файлу, а не только по превью, сдвигает остальные строки и сохраняет заголовок. Не придумывай номера строк и не подменяй удаление очисткой ячеек. Сложные файлы с формулами, структурированными таблицами Excel, объединениями и связями система отклонит. Формулы для set_cell начинаются с =. Не меняй незапрошенные ячейки.';
  let call: DynamicResponsesCall | null = null;
  const pendingCalls: DynamicResponsesCall[] = [];
  let settled = false;
  try {
    let data: { summary?: unknown; edits?: unknown } | null = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const responseCall = await runDynamicResponsesCall({
        userId: input.userId, actionId, providerCallIndex: attempt,
        feature: input.taskId ? 'ai_chat_planner' : 'ai_chat', apiKey: input.apiKey,
        // Only structured Office planning needs a higher output limit.
        maxOutputTokensCap: 8192,
        payload: {
          model: input.model,
          input: [
            { role: 'system', content: 'Ты редактор существующего офисного файла. Возвращай строго JSON правок по схеме. Не создавай файл с нуля. Не меняй незапрошенное. Если операция не поддерживается или контекст недостаточен, edits=[] и в summary объясни причину. Пиши краткие инструкции: не копируй исходный файл в JSON. ' + instruction + (attempt === 2 ? ' ПРЕДЫДУЩИЙ ответ не удалось разобрать. Верни только компактный законченный JSON, соответствующий схеме. Если полное изменение не помещается, верни edits=[] с честным объяснением, без частичных правок.' : '') },
            { role: 'user', content: 'Запрос: ' + input.question.slice(0, 5000) + '\\nФайл: ' + sourceName + '\\nТочные данные исходного файла:\\n' + preview.text }
          ],
          text: { format: { type: 'json_schema', name: 'office_edits', strict: true, schema: planSchema } },
          tool_choice: 'none'
        },
        stream: false
      });
      pendingCalls.push(responseCall);
      try {
        data = parseOfficeEditPlanResponse(responseCall.responseJson);
        call = responseCall;
        break;
      } catch (error) {
        if (!(error instanceof OfficeEditPlanResponseError) || attempt === 2) throw error;
        console.warn('[AI office edit] invalid plan, retrying once', {
          userId: input.userId, actionId, attempt,
          reason: error.reason,
          responseStatus: responseCall.responseJson.status ?? null,
          outputTokens: responseCall.responseJson.usage?.output_tokens ?? null
        });
        // The first incomplete attempt is not user-billable.
        await refundDynamicResponsesCall(responseCall);
        pendingCalls.pop();
      }
    }
    if (!data || !call) {
      throw new OfficeEditPlanResponseError('ИИ не смог подготовить безопасные правки файла.', 'invalid_json');
    }
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
    pendingCalls.pop();
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
  } catch (error) {
    if (!settled) {
      await Promise.all(pendingCalls.map((pending) => refundDynamicResponsesCall(pending).catch(() => undefined)));
    }
    if (error instanceof OfficeEditPlanResponseError) {
      console.warn('[AI office edit] plan could not be parsed after retry', {
        userId: input.userId, actionId, reason: error.reason
      });
      throw new TypeError(error.message + ' Исходный файл сохранён без изменений. Попробуйте запросить меньше правок за один раз.');
    }
    throw error;
  } finally {
    input.onProgress?.('forming_answer');
  }
}
