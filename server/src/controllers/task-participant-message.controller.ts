import type { Request, Response } from 'express';
import { taskParticipantMessageService } from '../services/task-participant-message.service.js';

export const taskParticipantMessageController = {
  send: async (req: Request, res: Response) => {
    const message = await taskParticipantMessageService.send({
      taskId: req.params.id,
      senderUserId: req.user!.id,
      recipientUserId: typeof req.body?.recipientUserId === 'string' ? req.body.recipientUserId : '',
      content: req.body?.content
    });
    res.status(201).json(message);
  }
};
