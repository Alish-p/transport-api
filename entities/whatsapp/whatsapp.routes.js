import { Router } from 'express';

import {
  getMessages,
  verifyWebhook,
  receiveWebhook,
  getConversations,
  markConversationAsRead,
} from './whatsapp.controller.js';
import { authenticate } from '../../middlewares/auth.js';
import pagination from '../../middlewares/pagination.js';

const router = Router();

// -----------------------------------------------------------------------------
// Public Webhook Endpoints (Meta Cloud API)
// -----------------------------------------------------------------------------
router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhook);

// -----------------------------------------------------------------------------
// Authenticated Viewer Endpoints
// -----------------------------------------------------------------------------
router.get('/messages', authenticate, pagination, getMessages);
router.get('/conversations', authenticate, pagination, getConversations);
router.patch('/conversations/:phone/read', authenticate, markConversationAsRead);

export default router;
