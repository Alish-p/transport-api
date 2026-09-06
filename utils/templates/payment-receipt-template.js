/**
 * Payment Receipt Email Template
 * Designed with Tranzit's brand identity: Georgia serif typography,
 * modern neutral palette (#E8E5DE, #FAFAF7, #F2EFE8), and #E8521A accent.
 */
export const getPaymentReceiptEmailTemplate = ({
  tenantName,
  amount,
  paymentDate,
  paymentMethod,
  planName,
  validTill,
  notes,
}) => {
  const formattedAmount = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0);

  const formattedPaymentDate = paymentDate
    ? new Date(paymentDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  const formattedValidTill = validTill
    ? new Date(validTill).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Receipt — Tranzit</title>
  <style>
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background-color: #E8E5DE;
      margin: 0;
      padding: 40px 16px;
    }
    .wrapper {
      max-width: 560px;
      margin: 0 auto;
      background: #FAFAF7;
      border: 1px solid #C8C4BC;
    }
    .header {
      background: #111010;
      padding: 28px 40px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .logo-text {
      color: #FAFAF7;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 20px;
      font-weight: normal;
      letter-spacing: 0.08em;
      margin: 0;
    }
    .body {
      padding: 40px 40px 32px;
    }
    .eyebrow {
      font-size: 11px;
      letter-spacing: 0.12em;
      color: #888480;
      text-transform: uppercase;
      margin: 0 0 16px;
    }
    h1 {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 24px;
      font-weight: normal;
      color: #111010;
      margin: 0 0 12px;
      line-height: 1.3;
    }
    .intro {
      font-size: 14px;
      color: #6B6763;
      line-height: 1.6;
      margin: 0 0 28px;
    }
    .amount-highlight {
      border: 1px solid #C8C4BC;
      background: #F2EFE8;
      padding: 24px;
      margin-bottom: 28px;
      text-align: center;
    }
    .amount-label {
      font-size: 11px;
      letter-spacing: 0.12em;
      color: #888480;
      text-transform: uppercase;
      margin: 0 0 8px;
    }
    .amount-val {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 34px;
      font-weight: bold;
      color: #111010;
      margin: 0;
    }
    .receipt-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 28px;
    }
    .receipt-table td {
      padding: 10px 0;
      border-bottom: 1px solid #E2DFD8;
      font-size: 14px;
    }
    .receipt-table .label {
      color: #888480;
      width: 40%;
    }
    .receipt-table .val {
      color: #111010;
      font-weight: 500;
      text-align: right;
    }
    .status-badge {
      display: inline-block;
      background: #007A55;
      color: #FFFFFF;
      font-size: 11px;
      font-weight: bold;
      padding: 3px 8px;
      border-radius: 3px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .disclaimer {
      border-left: 2px solid #E8521A;
      padding-left: 16px;
      margin-top: 24px;
    }
    .disclaimer p {
      font-size: 13px;
      color: #888480;
      line-height: 1.6;
      margin: 0;
    }
    .footer {
      border-top: 1px solid #C8C4BC;
      padding: 24px 40px;
      background: #F2EFE8;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .footer p {
      font-size: 12px;
      color: #888480;
      margin: 0;
    }
    .footer a {
      font-size: 12px;
      color: #E8521A;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="28" height="28" rx="4" fill="#E8521A"/>
        <path d="M7 9H21M11 9V19M17 14H21V19H17V14Z" stroke="#FAFAF7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <p class="logo-text">Tranzit</p>
    </div>

    <div class="body">
      <p class="eyebrow">Payment Receipt & Subscription Renewal</p>
      <h1>Payment confirmed for ${tenantName || 'your organization'}.</h1>
      <p class="intro">
        Thank you! We have received your payment. Your subscription has been successfully updated and extended as detailed below.
      </p>

      <div class="amount-highlight">
        <p class="amount-label">Amount Paid</p>
        <p class="amount-val">${formattedAmount}</p>
      </div>

      <table class="receipt-table">
        <tr>
          <td class="label">Organization</td>
          <td class="val">${tenantName || '—'}</td>
        </tr>
        <tr>
          <td class="label">Plan Name</td>
          <td class="val">${planName || 'Standard'}</td>
        </tr>
        <tr>
          <td class="label">Payment Date</td>
          <td class="val">${formattedPaymentDate}</td>
        </tr>
        <tr>
          <td class="label">Payment Method</td>
          <td class="val">${paymentMethod || '—'}</td>
        </tr>
        <tr>
          <td class="label">Payment Status</td>
          <td class="val"><span class="status-badge">SUCCESS</span></td>
        </tr>
        <tr>
          <td class="label">New Plan Validity</td>
          <td class="val" style="color: #007A55; font-weight: 600;">Valid till ${formattedValidTill}</td>
        </tr>
        ${
          notes
            ? `
        <tr>
          <td class="label">Reference / Notes</td>
          <td class="val">${notes}</td>
        </tr>
        `
            : ''
        }
      </table>

      <div class="disclaimer">
        <p>If you have any questions or require an invoice statement, please reply directly to this email or reach out to our billing team.</p>
      </div>
    </div>

    <div class="footer">
      <p>© ${new Date().getFullYear()} Tranzit Business Solutions</p>
      <a href="mailto:support@tranzitsolutions.com">support@tranzitsolutions.com</a>
    </div>
  </div>
</body>
</html>
`;
};
