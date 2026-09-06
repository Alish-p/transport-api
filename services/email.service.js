import { Resend } from 'resend';
import { getPaymentReceiptEmailTemplate } from '../utils/templates/payment-receipt-template.js';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Sends a payment receipt & subscription extension email to both the tenant's email
 * and Tranzit's official email address.
 *
 * @param {Object} params
 * @param {Object} params.tenant - Tenant document or object
 * @param {Object} params.payment - Recorded payment details { amount, paymentDate, paymentMethod, notes }
 * @param {Object} params.subscription - Updated subscription { planName, validTill }
 * @returns {Promise<{ success: boolean, recipients: string[], error?: string }>}
 */
export async function sendPaymentReceiptEmail({ tenant, payment, subscription }) {
  try {
    const recipients = new Set();

    if (tenant?.contactDetails?.email) {
      const email = tenant.contactDetails.email.trim().toLowerCase();
      if (email) recipients.add(email);
    }

    const officialEmail = (process.env.OFFICIAL_EMAIL || 'info@tranzitsolutions.com').trim().toLowerCase();
    if (officialEmail) {
      recipients.add(officialEmail);
    }

    const recipientList = Array.from(recipients);

    if (recipientList.length === 0) {
      console.warn('[email.service] No recipient emails found for tenant payment receipt', { tenantId: tenant?._id });
      return { success: false, recipients: [], error: 'No recipient email specified' };
    }

    const html = getPaymentReceiptEmailTemplate({
      tenantName: tenant?.name,
      amount: payment?.amount,
      paymentDate: payment?.paymentDate,
      paymentMethod: payment?.paymentMethod,
      planName: subscription?.planName,
      validTill: subscription?.validTill,
      notes: payment?.notes,
    });

    const response = await resend.emails.send({
      from: 'support@tranzitsolutions.com',
      to: recipientList,
      subject: `Payment Received & Subscription Extended — ${tenant?.name || 'Tranzit'}`,
      html,
    });

    return { success: true, recipients: recipientList, response };
  } catch (error) {
    console.error('Failed to send payment receipt email via Resend:', error);
    return { success: false, error: error.message };
  }
}

export default {
  sendPaymentReceiptEmail,
};
