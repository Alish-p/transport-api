export const getOtpEmailTemplate = (otp) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset — Tranzit</title>
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
      padding: 48px 40px 40px;
    }
    .eyebrow {
      font-size: 11px;
      letter-spacing: 0.12em;
      color: #888480;
      text-transform: uppercase;
      margin: 0 0 20px;
    }
    h1 {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 26px;
      font-weight: normal;
      color: #111010;
      margin: 0 0 20px;
      line-height: 1.3;
    }
    .intro {
      font-size: 15px;
      color: #6B6763;
      line-height: 1.65;
      margin: 0 0 36px;
    }
    .otp-box {
      border: 1px solid #C8C4BC;
      background: #F2EFE8;
      padding: 28px;
      margin-bottom: 36px;
      text-align: center;
    }
    .otp-label {
      font-size: 11px;
      letter-spacing: 0.12em;
      color: #888480;
      text-transform: uppercase;
      margin: 0 0 14px;
    }
    .otp-code {
      font-family: 'Courier New', Courier, monospace;
      font-size: 38px;
      font-weight: bold;
      letter-spacing: 10px;
      color: #111010;
      margin: 0;
      line-height: 1;
    }
    .disclaimer {
      border-left: 2px solid #E8521A;
      padding-left: 16px;
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
      <p class="eyebrow">Password Reset</p>
      <h1>A verification code<br>has been sent to you.</h1>
      <p class="intro">
        Use the code below to reset your Tranzit account password. For your security,
        this code expires in <strong style="color: #111010;">10 minutes</strong>.
      </p>

      <div class="otp-box">
        <p class="otp-label">Your one-time code</p>
        <p class="otp-code">${otp}</p>
      </div>

      <div class="disclaimer">
        <p>Didn't request this? You can safely ignore this email — your password will not change unless you use this code.</p>
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