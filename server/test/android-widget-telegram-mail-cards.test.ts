import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read=(path:string)=>readFile(new URL(path,import.meta.url),'utf8');
const java='../../android-app/app/src/main/java/ru/planirovych/app/';
const main='../../android-app/app/src/main/';

test('1x1 voice-only widget is separately registered and requests a fresh voice action',async()=>{
  const [manifest,metadata,layout,widget,existing] = await Promise.all([
    read(main+'AndroidManifest.xml'),
    read(main+'res/xml/voice_quick_ai_widget_info.xml'),
    read(main+'res/layout/widget_quick_ai_voice_only.xml'),
    read(java+'widget/VoiceQuickAiWidgetProvider.kt'),
    read(java+'widget/QuickAiWidgetProvider.kt')
  ]);
  assert.ok(manifest.includes('.widget.VoiceQuickAiWidgetProvider'));
  assert.ok(manifest.includes('@xml/voice_quick_ai_widget_info'));
  assert.match(metadata,/targetCellWidth="1"/);
  assert.match(metadata,/targetCellHeight="1"/);
  assert.match(metadata,/resizeMode="none"/);
  assert.match(layout,/widget_voice_only_target/);
  assert.match(layout,/ic_widget_microphone/);
  assert.match(widget,/MainActivity\.QUICK_AI_VOICE/);
  assert.match(widget,/FLAG_ACTIVITY_SINGLE_TOP/);
  assert.match(widget,/FLAG_UPDATE_CURRENT or PendingIntent\.FLAG_IMMUTABLE/);
  assert.ok(existing.includes('R.layout.widget_quick_ai'), 'old combined widget remains intact');
});

test('normal Chats AI tab access never replays the last one-shot widget input',async()=>{
  const [activity,home,workspace,chat]=await Promise.all([
    read(java+'MainActivity.kt'),
    read(java+'feature/home/HomeScreen.kt'),
    read(java+'feature/home/ModernWorkspace.kt'),
    read(java+'feature/home/NativeGeneralAiChat.kt')
  ]);
  assert.ok(activity.includes('intent.removeExtra(EXTRA_OPEN_GENERAL_AI)'));
  assert.ok(activity.includes('incoming.removeExtra(EXTRA_QUICK_AI_MODE)'));
  assert.ok(activity.includes('private fun consumeQuickAiCommand(id:Int)'));
  assert.ok(activity.includes('quickAiMode=null'));
  assert.ok(activity.includes('onQuickAiHandled=::consumeQuickAiCommand'));
  assert.ok(home.includes('onQuickAiHandled:(Int)->Unit={}'));
  assert.ok(home.includes('quickAiMode!=null'));
  assert.ok(home.includes('focusManager.clearFocus(force=true)'));
  assert.ok(home.includes('softwareKeyboard?.hide()'));
  assert.ok(workspace.includes('onQuickAiHandled=onQuickAiHandled'));
  assert.ok(chat.includes('if(quickAiMode==null || quickAiRequestId<=0'));
  assert.ok((chat.match(/onQuickAiHandled\(quickAiRequestId\)/g)||[]).length===2);
  assert.ok(chat.includes('handledQuickLaunch=quickAiRequestId'));
  assert.ok(chat.includes('speechInput()'));
  assert.ok(chat.includes('draftFocus.requestFocus()'));
});

test('Android retains Telegram and mail draft metadata in saved AI messages',async()=>{
  const [models,parsing,repo,vm,bubble]=await Promise.all([
    read(java+'data/model/Models.kt'),
    read(java+'data/model/GeneralAiModels.kt'),
    read(java+'data/repository/WorkspaceRepository.kt'),
    read(java+'feature/home/HomeViewModel.kt'),
    read(java+'feature/home/NativeTaskAiChat.kt')
  ]);
  assert.ok(models.includes('val mailSendDraft:'));
  assert.ok(parsing.includes('mailSendDraft=item["mailSendDraft"]'));
  assert.ok(repo.includes('mailSendDraft=item["mailSendDraft"]'));
  assert.ok(vm.includes('"telegramReadDraft","mailSendDraft"'));
  assert.ok(vm.includes('continueGeneralAiTelegramRead('));
  assert.ok(vm.includes('continueTaskAiTelegramRead('));
  assert.ok(repo.includes('if(telegramRead!=null)put("telegramRead",telegramRead)'));
  assert.ok(bubble.includes('NativeTelegramSendCard(actions,it,c)'));
  assert.ok(bubble.includes('NativeTelegramReadCard(actions,it,c,actionTaskId,actionTaskModel)'));
  assert.ok(bubble.includes('NativeMailSendCard(actions,it,c)'));
  assert.ok(!bubble.includes('Подтверждение действий Telegram доступно в Mini App.'));
});

test('native Telegram action cards require explicit send/approval and preserve idempotency',async()=>{
  const [sender,reader,api]=await Promise.all([
    read(java+'feature/home/NativeTelegramSendCard.kt'),
    read(java+'feature/home/NativeTelegramReadCard.kt'),
    read(java+'core/network/PlanirovychApi.kt')
  ]);
  for(const term of ['Сообщение в Telegram','Получатель','Отправить',
    'requestId','telegramQuickSendStatus','uncertain=true','recipientIds']) {
    assert.ok(sender.includes(term),term);
  }
  for(const term of ['Доступ к переписке Telegram','Разрешить и продолжить',
    'chatId','count','10,20,30,50,100','telegram_read_approvals',
    'continueGeneralAiTelegramRead','continueTaskAiTelegramRead']) {
    assert.ok(reader.includes(term),term);
  }
  assert.ok(api.includes('api/telegram-user-client/chat/send-targets'));
  assert.ok(api.includes('api/telegram-user-client/chat/quick-send'));
  assert.ok(api.includes('api/telegram-user-client/chat/quick-send/{requestId}'));
});

test('mail card is editable but only submits after confirmation and checks SMTP uncertainty',async()=>{
  const [card,api]=await Promise.all([
    read(java+'feature/home/NativeMailSendCard.kt'),
    read(java+'core/network/PlanirovychApi.kt')
  ]);
  for(const term of ['Новое письмо','От кого','Кому','Тема','Текст письма',
    'Изменить с ИИ','Отправить письмо','mailDraftStatus','mailSendDraft',
    'mailRewriteText','status="UNKNOWN"'])assert.ok(card.includes(term),term);
  assert.ok(card.includes('status!="PENDING"&&status!="FAILED"'));
  assert.ok(card.includes('draftId.isNotBlank()'));
  assert.ok(card.includes('Письмо уйдёт только после нажатия кнопки.'));
  assert.ok(api.includes('api/mail-assistant/drafts/{draftId}/send'));
  assert.ok(api.includes('api/mail-assistant/recent-recipients'));
});

test('next Android release is 1.0.5 with increasing versionCode=7',async()=>{
  const gradle=await read('../../android-app/app/build.gradle.kts');
  assert.ok(gradle.includes('versionCode = 7'));
  assert.ok(gradle.includes('versionName = "1.0.5"'));
  assert.ok(gradle.includes('applicationId = "ru.planirovych.app"'));
});
