/**
 * Netlify Serverless Function to handle secure contact form submission,
 * verify Cloudflare Turnstile CAPTCHA, and send email via Mailtrap API.
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
    } catch (e) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Invalid JSON request body' }),
      };
    }

    const { name, email, subject, message, turnstileToken } = payload;

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Missing required fields' }),
      };
    }

    // 1. Verify Cloudflare Turnstile CAPTCHA (if configured)
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    if (turnstileSecret) {
      if (!turnstileToken) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: false, message: 'CAPTCHA verification token is missing' }),
        };
      }

      const verifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
      const verifyRes = await fetch(verifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `secret=${encodeURIComponent(turnstileSecret)}&response=${encodeURIComponent(turnstileToken)}`,
      });

      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        console.error('Turnstile verification failed:', verifyData);
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: false, message: 'Security check failed. Please try again.' }),
        };
      }
    }

    // 2. Prepare Mailtrap Credentials
    const mailtrapToken = process.env.MAILTRAP_API_TOKEN;
    const senderEmail = process.env.MAILTRAP_SENDER_EMAIL;
    const recipientEmail = process.env.MAILTRAP_RECIPIENT_EMAIL;

    if (!mailtrapToken || !senderEmail || !recipientEmail) {
      console.error('Missing Mailtrap configuration environment variables');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Email service is not configured' }),
      };
    }

    // 3. Determine Mailtrap Endpoint (Sandbox vs Production Sending)
    const sandboxInboxId = process.env.MAILTRAP_INBOX_ID;
    let mailtrapUrl = 'https://send.api.mailtrap.io/api/send';
    if (sandboxInboxId) {
      mailtrapUrl = `https://sandbox.api.mailtrap.io/api/send/${sandboxInboxId}`;
    }

    // 4. Send Email via Mailtrap API
    const emailData = {
      from: {
        email: senderEmail,
        name: 'Portfolio Contact Form',
      },
      to: [
        {
          email: recipientEmail,
        },
      ],
      reply_to: {
        email: email,
        name: name,
      },
      subject: `[Contact Form] ${subject}`,
      text: `You received a new message from your portfolio website:\n\n` +
            `----------------------------------------\n` +
            `Name:    ${name}\n` +
            `Email:   ${email}\n` +
            `Subject: ${subject}\n` +
            `----------------------------------------\n\n` +
            `Message:\n${message}\n`,
      category: 'Contact Form',
    };

    const mailtrapRes = await fetch(mailtrapUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mailtrapToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailData),
    });

    const responseText = await mailtrapRes.text();
    let mailtrapData = {};
    try {
      mailtrapData = JSON.parse(responseText);
    } catch (e) {
      mailtrapData = { raw: responseText };
    }

    if (!mailtrapRes.ok) {
      console.error('Mailtrap sending failed:', mailtrapRes.status, mailtrapData);
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Failed to send email through Mailtrap' }),
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
