# Power Automate Webhook Email Integration

> **Last Updated**: February 2026
> **Status**: Production Ready
> **Key Commit**: `77a947f` - "Where it All Changed"

---

## Overview

This document explains how the newsletter email system works using Power Automate webhooks instead of traditional SMTP. This approach allows emails to be sent from the corporate O365 account (@woodmontproperties.com) without storing email credentials in GitHub.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        EMAIL SENDING FLOW                                │
└─────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐       ┌───────────────────┐       ┌──────────────────┐
  │   GitHub     │       │   Power Automate  │       │   Recipients     │
  │   Actions    │──────►│   (Webhook Flow)  │──────►│   (O365 Email)   │
  │              │ HTTP  │                   │ Send  │                  │
  │ Scheduled    │ POST  │ - Receives JSON   │ Email │ Emails appear    │
  │ 7 AM EST     │       │ - Extracts fields │  V2   │ from corporate   │
  │ Mon-Fri      │       │ - Sends via O365  │       │ @woodmontproperties.com
  └──────────────┘       └───────────────────┘       └──────────────────┘
         │                        ▲
         │                        │
         ▼                        │
  ┌──────────────┐       ┌───────────────────┐
  │ rssfeed.ts   │       │  GitHub Secrets   │
  │              │       │                   │
  │ --send-      │       │ WEBHOOK_URL       │
  │ newsletter-  │◄──────│ WEBHOOK_SECRET    │
  │ work         │       │ EMAIL_TO          │
  └──────────────┘       └───────────────────┘
```

---

## How It Works

### 1. The Code Flow

When the newsletter is triggered, the code in `src/server/email.ts` does the following:

```typescript
// Simplified flow
export async function sendEmail(to, subject, html) {
    // 1. Check if webhook is configured
    if (process.env.WEBHOOK_URL) {
        // 2. Try webhook first (corporate email)
        const success = await sendViaWebhook(to, subject, html);
        if (success) return true;
    }

    // 3. Fall back to SMTP if webhook fails or not configured
    if (process.env.SMTP_HOST) {
        return await sendViaSMTP(to, subject, html);
    }

    return false;
}
```

### 2. The Webhook Payload

The code sends this JSON to Power Automate:

```json
{
    "to": "recipient1@company.com, recipient2@company.com",
    "subject": "Woodmont Industrial Partners — Daily Industrial News Briefing",
    "body": "<html>...newsletter HTML content...</html>",
    "apiKey": "optional-security-key"
}
```

### 3. Power Automate Flow

The Power Automate flow:
1. **Trigger**: "When an HTTP request is received"
2. **Action**: "Send an email (V2)" from Office 365 Outlook

---

## Setup Instructions

### Part 1: Create the Power Automate Flow

1. Go to [make.powerautomate.com](https://make.powerautomate.com)

2. Click **Create** → **Instant cloud flow**

3. Name it: `Newsletter Email Webhook`

4. Select trigger: **When an HTTP request is received**

5. In the trigger, set the **Request Body JSON Schema**:
   ```json
   {
       "type": "object",
       "properties": {
           "to": {
               "type": "string"
           },
           "subject": {
               "type": "string"
           },
           "body": {
               "type": "string"
           },
           "apiKey": {
               "type": "string"
           }
       },
       "required": ["to", "subject", "body"]
   }
   ```

6. Add action: **Send an email (V2)** (Office 365 Outlook)
   - **To**: Use dynamic content → `to`
   - **Subject**: Use dynamic content → `subject`
   - **Body**: Use dynamic content → `body`
   - **Is HTML**: Yes

7. **Save** the flow

8. Go back to the trigger and **copy the HTTP POST URL**

### Part 2: Add GitHub Secrets

Go to: `https://github.com/woodmont-industrial/Woodmont-Industrial-News-Briefing/settings/secrets/actions`

Add these repository secrets:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `WEBHOOK_URL` | The HTTP POST URL from Power Automate | `https://prod-XX.westus.logic.azure.com/workflows/...` |
| `WEBHOOK_SECRET` | Optional security key | `my-secret-key-123` |
| `EMAIL_TO` | Recipient email addresses | `user1@company.com,user2@company.com` |

### Part 3: Test the Integration

1. Go to **GitHub Actions** tab
2. Find **Send Newsletter (Work)** workflow
3. Click **Run workflow** → **Run workflow**
4. Check the workflow logs for success
5. Check recipient inboxes for the email

---

## File Locations

| File | Purpose |
|------|---------|
| `src/server/email.ts` | Email sending logic (webhook + SMTP fallback) |
| `.github/workflows/send-newsletter-work.yml` | GitHub Action that triggers newsletter |
| `.env.example` | Environment variable documentation |
| `docs/POWER_AUTOMATE_INTEGRATION.md` | This documentation |

---

## Troubleshooting

### Webhook Not Working

**Check the logs in GitHub Actions:**
```
📤 Sending email via Power Automate webhook...
   To: recipient@company.com
   Subject: Woodmont Industrial Partners — Daily Industrial News Briefing
   Body length: 45230 characters
❌ Webhook failed with status: 400
```

**Common issues:**
1. **Webhook URL incorrect** - Copy the full URL from Power Automate
2. **Flow not saved/published** - Make sure you saved the flow
3. **JSON schema mismatch** - Ensure the schema matches the payload

### Email Not Arriving

1. Check Power Automate flow **Run history**
2. Look for errors in the Send Email action
3. Check spam/junk folder
4. Verify the "to" address is correct

### Falling Back to SMTP

If you see this in logs:
```
⚠️ Webhook failed, trying SMTP fallback...
📌 Using SMTP fallback
```

The webhook failed and it's using Gmail SMTP. Check your Power Automate flow.

---

## Security Considerations

### Webhook URL Protection

The webhook URL acts like an API key - anyone with it can trigger emails. To protect it:

1. **Keep it in GitHub Secrets only** - Never commit to code
2. **Add API key validation** in Power Automate (optional):
   - Add a Condition action after the trigger
   - Check if `apiKey` equals your secret
   - Only send email if it matches

### Adding API Key Validation to Power Automate

```
Trigger: When an HTTP request is received
    ↓
Condition: apiKey equals 'your-secret-key'
    ├─ If yes → Send an email (V2)
    └─ If no → Respond with 401 Unauthorized
```

---

## Reverting to SMTP-Only

If the webhook integration doesn't work, you can easily revert:

### Option 1: Just don't set WEBHOOK_URL
The code automatically falls back to SMTP if `WEBHOOK_URL` is not set.

### Option 2: Git revert
```bash
git revert 77a947f
```
This reverts the "Where it All Changed" commit.

---

## For Future Claude Agents

### Understanding the Email System

1. **Primary method**: Power Automate webhook (`WEBHOOK_URL`)
   - Sends from corporate O365 account
   - No SMTP credentials needed in GitHub
   - Works through corporate firewalls (HTTPS only)

2. **Fallback method**: SMTP via NodeMailer
   - Uses Gmail or other SMTP server
   - Requires `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` secrets
   - Used if webhook not configured or fails

### Key Code Location

The email logic is in `src/server/email.ts`:
- `sendViaWebhook()` - Webhook implementation (lines 15-55)
- `sendViaSMTP()` - SMTP fallback (lines 60-95)
- `sendEmail()` - Main function that chooses method (lines 100-125)

### Environment Variables

| Variable | Method | Required | Description |
|----------|--------|----------|-------------|
| `WEBHOOK_URL` | Webhook | Yes* | Power Automate HTTP trigger URL |
| `WEBHOOK_SECRET` | Webhook | No | Optional API key for security |
| `EMAIL_TO` | Both | Yes | Recipient email addresses |
| `SMTP_HOST` | SMTP | Yes* | SMTP server hostname |
| `SMTP_PORT` | SMTP | Yes* | SMTP port (587 or 465) |
| `SMTP_USER` | SMTP | Yes* | SMTP username |
| `SMTP_PASS` | SMTP | Yes* | SMTP password/app password |
| `EMAIL_FROM` | SMTP | Yes* | Sender email address |

*At least one method (webhook OR SMTP) must be configured.

### Modifying the Email System

If you need to modify the email system:

1. **Change payload structure**: Update `sendViaWebhook()` in `email.ts` AND the Power Automate flow schema
2. **Add new email method**: Add a new `sendVia*()` function and update `sendEmail()` priority
3. **Change recipients**: Update `EMAIL_TO` in GitHub Secrets

---

## Changelog

| Date | Change | Commit |
|------|--------|--------|
| Feb 2026 | Initial webhook integration | `77a947f` |

---

**Questions?** Check the GitHub Actions logs or Power Automate flow run history for debugging.
