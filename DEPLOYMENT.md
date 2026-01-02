# GitHub Pages Deployment Checklist

## ✅ Pre-Deployment Tasks
1. [ ] Remove sensitive SMTP credentials from rssfeed.ts (already done)
2. [ ] Ensure all RSS feeds are working
3. [ ] Test local build with `npm run build`
4. [ ] Create GitHub repository (if not exists)

## ✅ GitHub Setup
1. [ ] Push code to GitHub repository
2. [ ] Enable GitHub Pages in repository settings
   - Source: Deploy from a branch
   - Branch: `main` / `docs` folder
3. [ ] Add GitHub Actions workflow (already created)
4. [ ] Configure repository secrets for Copilot Agent
   - `MICROSOFT_GRAPH_CLIENT_ID`
   - `MICROSOFT_GRAPH_CLIENT_SECRET`
   - `MICROSOFT_GRAPH_TENANT_ID`

## ✅ Copilot Agent Setup
1. [ ] Create Microsoft App Registration in Azure AD
2. [ ] Configure Graph API permissions for email sending
3. [ ] Set up Copilot Agent with copilot-agent.yml
4. [ ] Test email sending manually

## ✅ Testing Checklist
1. [ ] Manual workflow trigger test
2. [ ] Verify GitHub Pages deployment
3. [ ] Test article loading from JSON
4. [ ] Test PDF download functionality
5. [ ] Test email delivery
6. [ ] Verify daily schedule (8 AM EST)
7. [ ] Verify weekly review (Fridays 4 PM EST)

## ✅ Post-Deployment
1. [ ] Monitor first automated run
2. [ ] Check email delivery
3. [ ] Verify article updates
4. [ ] Set up monitoring/alerts

## 🚨 Important Notes
- No SMTP credentials in code - using Microsoft Graph API
- GitHub Actions runs Monday-Friday only
- Articles stored in articles.json in repo root
- Frontend served from /docs folder
- Copilot Agent handles all email operations

## 📋 Timeline
- **Today**: Complete GitHub setup and initial deployment
- **Tomorrow Morning**: Test automated run
- **Tomorrow EOD**: Final verification and handover
