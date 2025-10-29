WhatsApp Cloud API Integration

- Environment variables:
  - `WA_ACCESS_TOKEN`: Permanent or System User token with whatsapp_business_messaging.
  - `WA_PHONE_NUMBER_ID`: Phone Number ID from WhatsApp Manager.
  - `WA_GRAPH_API_VERSION` (optional): Defaults to `v22.0`.
  - `WA_DEFAULT_COUNTRY_CODE` (optional): Defaults to `91`.

- Tenant-level override (optional):
  - `Tenant.integrations.whatsapp = { enabled: true, config: { accessToken, phoneNumberId, languageCode } }`

- Sending:
  - On transporter payment generation, a template message `transporter_payment_generated` is sent to `transporter.cellNo` if WhatsApp is enabled for the tenant.
  - Body params order: `[ownerName|transportName, tenantName, paymentId, issueDate, netAmount]`
  - Button (index 0) param: `receipt._id` for URL templates.

