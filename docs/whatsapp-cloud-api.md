WhatsApp Cloud API Integration

- Environment variables:
  - `WA_ACCESS_TOKEN`: Permanent or System User token with whatsapp_business_messaging.
  - `WA_PHONE_NUMBER_ID`: Phone Number ID from WhatsApp Manager.
  - `WA_VERIFY_TOKEN`: Secret string for Meta Webhook verification handshake.
  - `WA_GRAPH_API_VERSION` (optional): Defaults to `v22.0`.
  - `WA_DEFAULT_COUNTRY_CODE` (optional): Defaults to `91`.

- Tenant-level notification toggle:
  - `Tenant.integrations.whatsapp = { enabled: Boolean }`
  - When enabled, automated WhatsApp notifications (e.g., LR generation, driver assignment, transporter payment) are dispatched using the global application credentials.

- Sending (Outbound):
  - On transporter payment generation, a template message `transporter_payment_generated` is sent to `transporter.cellNo` if WhatsApp is enabled for the tenant.
  - Body params order: `[ownerName|transportName, tenantName, paymentId, issueDate, netAmount]`
  - Button (index 0) param: `receipt._id` for URL templates.
  - All outbound template messages are automatically recorded in `WhatsAppMessage` collection for thread auditing.

- Receiving (Webhooks & Inbound):
  - Webhook URL: `https://<api-domain>/api/whatsapp/webhook`
  - Meta Handshake: `GET /api/whatsapp/webhook` responds to `hub.mode === 'subscribe'` and verifies `hub.verify_token === process.env.WA_VERIFY_TOKEN`.
  - Event Ingestion: `POST /api/whatsapp/webhook` ingests messages (text, image, document, location, buttons, interactive) and status receipts (`sent`, `delivered`, `read`).
  - Auto-Entity Resolution: Automatically resolves sender phone number to `Driver`, `Transporter`, or `Customer` entities in the system.

- Viewing API (Authenticated):
  - `GET /api/whatsapp/conversations`: Groups messages into contact conversation threads with unread counts and last activity.
  - `GET /api/whatsapp/messages`: Returns paginated message history (filterable by `phone`, `direction`, `entityType`, `search`, `startDate`, `endDate`).
  - `PATCH /api/whatsapp/conversations/:phone/read`: Marks incoming messages for a phone number as read.

