import { Router } from 'express';

import pagination from '../../middlewares/pagination.js';
import { authenticate, requireSuperuser } from '../../middlewares/auth.js';
import {
  verifyWebhook,
  getMediaProxy,
  receiveWebhook,
  sendTextMessage,
  getConversations,
  markConversationAsRead,
  getConversationMessages,
} from './whatsapp.controller.js';

const router = Router();

// Public: Meta Webhook
router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhook);

// Superuser-only endpoints
router.get('/conversations', authenticate, requireSuperuser, pagination, getConversations);
router.get('/conversations/:conversationId/messages', authenticate, requireSuperuser, getConversationMessages);
router.patch('/conversations/:conversationId/read', authenticate, requireSuperuser, markConversationAsRead);
router.post('/messages/send', authenticate, requireSuperuser, sendTextMessage);
router.get('/media/:mediaId', authenticate, requireSuperuser, getMediaProxy);

export default router;
