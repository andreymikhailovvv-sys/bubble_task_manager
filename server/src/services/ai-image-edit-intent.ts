/**
 * Edit an existing generated image only for explicit image follow-ups.
 * Never reinterpret changes to tasks, settings, or text as an image edit.
 * The client supplies the most recent generated image ID, but the server
 * independently validates its ownership before sending its pixels to OpenAI.
 */
export function isGeneratedImageEditRequest(question: string): boolean {
  const q = question.trim().toLowerCase();
  if (!q || q.length > 3200) return false;
  const editing = /(?:измен(?:и|ить|ите|яй)|передел(?:ай|ать|айте)|отредактир|поправ(?:ь|ить)|исправ(?:ь|ить)|перерис|поменя(?:й|ть)|замен(?:и|ить)|добав(?:ь|ить)|убер(?:и|ите)|удал(?:и|ить)|сделай|сделайте|пусть\s+(?:на\s+н[её]м|там)|edit\b|change\b|modify\b|replace\b|remove\b|add\b)/i.test(q);
  if (!editing) return false;
  if (/(?:задач|подзадач|дедлайн|напоминан|событи|сектор|таблиц|документ|ворд|excel|xlsx|календар|расписан|кредит)/i.test(q)
      && !/(?:картинк|изображен|рисунк|фот|снимк|png|пиксел)/i.test(q)) return false;
  return /(?:картинк|изображен|рисунк|фот|снимк|png|пиксел|фон|цвет|яркост|контраст|текст\s+на\s+(?:н[её]м|картинк)|на\s+(?:н[её]м|ней|картинк)|у\s+(?:не[её]|изображен)|в\s+(?:ней|н[её]м)|е[её](?:\s|[,!.])|его\s+|эту\s+|этот\s+|там\s+|а\s+теперь|\b(?:image|photo|picture|background|sky)\b)/i.test(q);
}
