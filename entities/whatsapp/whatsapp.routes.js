import { Router } from 'express';
import {
  verifyWebhook,
  receiveWebhook,
  getConversations,
  getConversationMessages,
  sendTextMessage,
  markConversationAsRead,
  getMediaProxy,
} from './whatsapp.controller.js';
import { authenticate, requireSuperuser } from '../../middlewares/auth.js';
import pagination from '../../middlewares/pagination.js';

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
