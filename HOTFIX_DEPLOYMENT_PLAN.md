# Hotfix Deployment Plan
**Date:** 2026-04-05  
**Environment:** AWS Production (itsag2t3.com)  
**Hotfix Version:** v1.1.1

## Changes Included

### Backend Changes:
1. **ClientRepository.java** - Fixed phone number uniqueness constraints to exclude soft-deleted clients

### Frontend Changes:
1. **sidebarNav.ts** - Removed "Home" link from non-root admin sidebar
2. **App.tsx** - Added redirect to prevent non-root admins from accessing dashboard

## Pre-Deployment Checklist

- [ ] All unit tests passing (backend)
- [ ] All unit tests passing (frontend)
- [ ] Integration tests passing
- [ ] Backend lambdas built and zipped
- [ ] Frontend built and ready for S3/CloudFront deployment
- [ ] Terraform plan reviewed (if infrastructure changes)
- [ ] Backup verification: Latest production database snapshot confirmed

## Deployment Steps

### Option 1: GitHub Actions (Recommended)
```bash
# 1. Commit changes
git add services/backend/client/src/main/java/com/scroogebank/crm/client_service/repository/ClientRepository.java
git add services/frontend/crm-ui/src/navigation/sidebarNav.ts
git add services/frontend/crm-ui/src/app/App.tsx
git commit -m "hotfix: fixed phone uniqueness constraint and admin RBAC"

# 2. Push to main
git push origin main

# 3. Wait for GitHub Actions to build and deploy
# Monitor at: https://github.com/[org]/[repo]/actions

# 4. Verify deployment via AWS Console or CLI
aws lambda list-functions --query "Functions[?contains(FunctionName, 'client')].FunctionName"
aws s3 ls s3://[frontend-bucket]/ --recursive | head
```

### Option 2: Manual AWS CLI Deployment

#### Backend Deployment:
```bash
# 1. Build and package lambdas
cd services/backend/client
./gradlew clean build
cd build/distributions
# Upload to S3 or update Lambda directly

# Update client Lambda
aws lambda update-function-code \
  --function-name itsa-crm-client \
  --zip-file fileb://client-lambda.zip \
  --region ap-southeast-1

# Update agent Lambda
aws lambda update-function-code \
  --function-name itsa-crm-agent \
  --zip-file fileb://agent-lambda.zip \
  --region ap-southeast-1
```

#### Frontend Deployment:
```bash
# 1. Build frontend
cd services/frontend/crm-ui
npm run build

# 2. Deploy to S3
aws s3 sync dist/ s3://[frontend-bucket]/ --delete

# 3. Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id E339YUQCFN3WG \
  --paths "/*"
```

### Option 3: Terraform (Full Infrastructure)
```bash
# Set environment
export TERRAFORM_ENV=prod
export INFRACOST_API_KEY=ico-K2qrdbVzVjkdKrAMGuoyPBH5NvrlJyIC

# Run Terraform apply
cd terraform/environments/prod
terraform plan -out=hotfix.plan
terraform apply hotfix.plan
```

## Post-Deployment Verification

### 1. Smoke Tests - RBAC
```bash
# Test as root admin (admin@crm.com)
# - Login successful
# - Dashboard visible
# - All sidebar items present (Home, All Clients, Client Archives, etc.)

# Test as non-root admin
# - Login successful
# - No "Home" in sidebar
# - Accessing /admin redirects to /admin/users
# - Can manage users
# - Can view activity logs

# Test as agent
# - Login successful
# - Can view assigned clients
# - Can create clients
```

### 2. Smoke Tests - Phone Uniqueness
```bash
# 1. Create client with phone +6591234567 and email test@example.com
# 2. Archive the client
# 3. Create new client with same phone +6591234567 and different email test2@example.com
# Expected: SUCCESS (should allow creation)
# 4. Create another client with same email test@example.com and different phone +6598765432
# Expected: SUCCESS (should allow creation)
```

### 3. Smoke Tests - Agent Archive Workflow
```bash
# 1. Login as root admin
# 2. Create test agent
# 3. Assign client to test agent
# 4. Disable the agent
# Expected: "Transfer" button shown, NO "Archive" button
# 5. Transfer clients to another agent
# Expected: Agent auto-archived after transfer
# 6. Create another agent with no clients
# 7. Disable the agent
# Expected: "Archive" button shown (no Transfer since 0 clients)
```

### 4. Network Errors Check
```bash
# Open browser DevTools (F12) -> Network tab
# Login as each role (root admin, admin, agent)
# Navigate through all pages
# Check for any 4xx/5xx errors in Network tab
```

## Rollback Plan

### If issues are detected:
1. **Backend:** Redeploy previous Lambda versions
   ```bash
   # List versions
   aws lambda list-versions-by-function --function-name itsa-crm-client
   
   # Rollback to previous version
   aws lambda update-alias \
     --function-name itsa-crm-client \
     --name prod \
     --function-version [previous-version]
   ```

2. **Frontend:** Revert CloudFront to previous S3 bucket version
   ```bash
   # Enable S3 versioning if not already enabled
   aws s3api put-bucket-versioning \
     --bucket [frontend-bucket] \
     --versioning-configuration Status=Enabled
   
   # List versions
   aws s3api list-object-versions --bucket [frontend-bucket] --prefix index.html
   
   # Restore previous version
   aws s3 sync s3://[frontend-bucket]-backup/ s3://[frontend-bucket]/ --delete
   aws cloudfront create-invalidation --distribution-id E339YUQCFN3WG --paths "/*"
   ```

3. **Full Rollback:** Revert git commit and redeploy
   ```bash
   git revert HEAD
   git push origin main
   # Wait for GitHub Actions to deploy
   ```

## Monitoring

### Metrics to Watch (First 24 hours):
- Lambda error rates (CloudWatch)
- API Gateway 4xx/5xx rates
- Frontend error rates (CloudWatch Logs from browser)
- User login success/failure rates
- Client creation success/failure rates

### CloudWatch Dashboards:
- CRM Application Dashboard
- Lambda Performance Dashboard
- API Gateway Dashboard

### Alerts:
- Lambda error rate > 1%
- API Gateway 5xx rate > 0.5%
- High latency (P95 > 5000ms)

## Success Criteria

- [ ] All smoke tests pass
- [ ] No network errors in browser console
- [ ] Users can create clients with previously used phone numbers from archived clients
- [ ] Non-root admins cannot access dashboard
- [ ] Agents with clients cannot be archived without transfer
- [ ] No increase in error rates (CloudWatch)
- [ ] No user complaints for 24 hours

## Communication Plan

### Before Deployment:
- Notify stakeholders of planned deployment
- Estimated downtime: 0 minutes (rolling deployment)
- Deployment window: [DATE/TIME]

### During Deployment:
- Monitor Slack channel for user reports
- Have team on standby for rollback if needed

### After Deployment:
- Send deployment success notification
- Document any issues encountered
- Update runbook with lessons learned

## Notes

- **Critical Databases:** PostgreSQL RDS instance (db-6BFV6SOESRU7RCFDFQZZXZHKTU)
- **CloudFront Distribution:** E339YUQCFN3WG
- **Root Admin Credentials:** admin@crm.com / [see NOTES.md]
- **AWS Account:** 699089610166
- **Region:** ap-southeast-1

## Emergency Contacts

- **On-Call Engineer:** [TBD]
- **AWS Support:** [Case Number]
- **Stakeholder:** [TBD]
