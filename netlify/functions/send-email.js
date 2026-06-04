/**
 * Netlify Serverless Function to handle secure contact form submission,
 * verify Cloudflare Turnstile CAPTCHA, and send email via Resend API.
 */
export async function handler(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Allow': 'POST',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ success: false, message: 'Method Not Allowed' }),
    };
  }

  try {
    let payload;
    try {
      payload = JSON.parse(event.body);
      console.log('Received payload:', payload);
    } catch (e) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Invalid JSON request body' }),
      };
    }

    const { name, email, subject, message, recaptchaToken } = payload;

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Missing required fields' }),
      };
    }

    // 1. Verify Google reCAPTCHA (if configured)
    const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
    if (recaptchaSecret) {
      if (!recaptchaToken) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: false, message: 'Security check failed. Please try again.' }),
        };
      }

      const verifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
      const verifyRes = await fetch(verifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `secret=${encodeURIComponent(recaptchaSecret)}&response=${encodeURIComponent(recaptchaToken)}`,
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        console.error('reCAPTCHA verification failed:', verifyData);
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: false, message: 'Security check failed. Please try again.' }),
        };
      }
    }

    // 2. Prepare Resend Credentials
    const resendApiKey = process.env.RESEND_API_KEY;
    const senderEmail = process.env.RESEND_SENDER_EMAIL || 'onboarding@resend.dev';
    const recipientEmail = process.env.RESEND_RECIPIENT_EMAIL || 'junnesdaniel@gmail.com';

    if (!resendApiKey) {
      console.error('Missing Resend configuration environment variables');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Email service is not configured' }),
      };
    }

    // 3. Send Email via Resend API
    const resendUrl = 'https://api.resend.com/emails';
    const emailData = {
      from: `Portfolio Contact Form <${senderEmail}>`,
      to: [recipientEmail],
      reply_to: `${name} <${email}>`,
      subject: `[Contact Form] ${subject}`,
      text: `You received a new message from your portfolio website:\n\n` +
            `----------------------------------------\n` +
            `Name:    ${name}\n` +
            `Email:   ${email}\n` +
            `Subject: ${subject}\n` +
            `----------------------------------------\n\n` +
            `Message:\n${message}\n`,
    };

    const resendRes = await fetch(resendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailData),
    });

    const responseText = await resendRes.text();
    let resendData = {};
    try {
      resendData = JSON.parse(responseText);
    } catch (e) {
      resendData = { raw: responseText };
    }

    if (!resendRes.ok) {
      console.error('Resend sending failed:', resendRes.status, resendData);
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Failed to send email through Resend' }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, message: 'Email sent successfully!' }),
    };

  } catch (error) {
    console.error('Serverless function error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, message: 'Internal Server Error' }),
    };
  }
}
