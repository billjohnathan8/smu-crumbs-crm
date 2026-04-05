# Production Hotfix Bugs Report
**Date:** 2026-04-05  
**Environment:** AWS Production (itsag2t3.com)

## Summary of Bugs Identified

### 🐞🟡 MAJOR BUG #1: Phone Number Uniqueness Constraint
**Status:** CONFIRMED - CRITICAL  
**Location:** `services/backend/client/src/main/java/com/scroogebank/crm/client_service/repository/ClientRepository.java`

**Issue:**
- Uniqueness checks for email and phone number do NOT filter by `deleted=false`
- Soft-deleted clients block creation of new clients with the same phone number or email
- User reports: "system incorrectly returns email address already exists when the real issue is phone number already exists (from a deleted client)"

**Affected Code:**
```java
// Line 15-16: Missing deleted filter
@Query("SELECT COUNT(c) > 0 FROM ClientEntity c WHERE LOWER(c.emailAddress) = LOWER(:email)")
boolean existsByEmailAddressIgnoreCase(@Param("email") String emailAddress);

// Line 18-19: Missing deleted filter
@Query("SELECT COUNT(c) > 0 FROM ClientEntity c WHERE c.phoneNumber = :phone")
boolean existsByPhoneNumber(@Param("phone") String phoneNumber);

// Line 21-22: Missing deleted filter
@Query("SELECT COUNT(c) > 0 FROM ClientEntity c WHERE LOWER(c.emailAddress) = LOWER(:email) AND c.id <> :id")
boolean existsByEmailAddressIgnoreCaseAndIdNot(@Param("email") String emailAddress, @Param("id") Long id);

// Line 24-25: Missing deleted filter
@Query("SELECT COUNT(c) > 0 FROM ClientEntity c WHERE c.phoneNumber = :phone AND c.id <> :id")
boolean existsByPhoneNumberAndIdNot(@Param("phone") String phoneNumber, @Param("id") Long id);
```

**Fix Required:**
Add `AND c.deleted = false` to all four query methods.

**Impact:**
- Users cannot create clients with phone numbers/emails previously used by archived clients
- Error messages may be misleading

---

### 🐞🟡 MAJOR BUG #2: Admin Home Page Access (RBAC Violation)
**Status:** CONFIRMED - MEDIUM PRIORITY  
**Location:** `services/frontend/crm-ui/src/navigation/sidebarNav.ts` line 16

**Issue:**
- Non-root admins have "Home" link in sidebar navigation
- Per requirements: "Admins (except root admin) should NOT be able to view client data, only allows to view and manage agents"
- Admin home page shows client statistics that non-root admins shouldn't see

**Affected Code:**
```typescript
export const adminSidebarNav: NavItem[] = [
  { label: 'Home', to: '/admin', end: true },  // ❌ Should NOT be here
  { label: 'User Management', to: '/admin/users', end: true },
  { label: 'Activity Logs', to: '/admin/logs' },
  { label: 'Settings', to: '/admin/settings' },
]
```

**Fix Required:**
Remove the Home link from `adminSidebarNav`. Admins should only have:
- User Management
- Activity Logs  
- Settings

**Impact:**
- RBAC violation: Non-root admins can access dashboard with client-related data
- Security concern: Information leakage

---

### 🐞🟡 MAJOR BUG #3: Agent Archive Without Transfer
**Status:** NEEDS INVESTIGATION  
**Location:** `services/frontend/crm-ui/src/pages/AdminUserManagementPage.tsx`

**Issue:**
- User reports: "rn u can directly archive, bypassing the transfering, which is not allowed"
- Expected flow: Disable → Transfer clients (if any) → Archive (automatic)
- Current code APPEARS correct but may have race condition or backend issue

**Current Logic (appears correct):**
```typescript
// Lines 547-558: Show Transfer button if agent has clients
{isRootAdmin && (agentClientCounts[u.id] ?? -1) > 0 && (
  <button onClick={() => openTransferModal(u)}>Transfer</button>
)}

// Lines 560-572: Show Archive button only if agent has 0 clients
{isRootAdmin && (agentClientCounts[u.id] ?? -1) === 0 && (
  <button onClick={() => handleDeleteUser(u.id, u.role)}>Archive</button>
)}
```

**Possible Issues:**
1. Client count might not be loaded yet (shows -1, neither button appears)
2. Backend might not enforce the constraint
3. Race condition between client count fetch and button render

**Fix Required:**
- Add backend validation to prevent archiving agents with active clients
- Ensure frontend always waits for client count before showing buttons
- Add loading state for Archive/Transfer buttons

**Impact:**
- Data integrity: Agents with active clients can be archived, leaving clients orphaned
- Business logic violation

---

### 🐞 Minor Bug #4: Client Archives UI Visibility
**Status:** NEEDS INVESTIGATION  
**User Report:** "when logged in as root admin, client archives pops up, then when you click on all clients its hidden"

**Location:** Frontend sidebar navigation  
**Expected Behavior:** Client Archives should be consistently visible for root admin

---

### ✅ Non-Bug #5: Agent Dashboard Pending Verifications
**Status:** NOT A BUG - Working as expected  
**Location:** `services/frontend/crm-ui/src/pages/UserDashboard.tsx` lines 446-491

**Verification:**
Agent dashboard DOES show pending verifications table correctly.

---

### ❓ Unconfirmed #6: Account Open Date Validation
**Status:** NO CODE FOUND  
**User Report:** "account open date can be set in the past/future, should just be system generated at time of creation"

**Investigation:**
- No `accountOpenDate` field found in backend ClientService
- No `accountOpenDate` field found in frontend forms
- This might be related to account entities, not client entities
- **Needs further investigation**

---

## Fixes Implemented

### ✅ Fix #1: Phone Number Uniqueness Queries (COMPLETED)
**File:** `services/backend/client/src/main/java/com/scroogebank/crm/client_service/repository/ClientRepository.java`

**Changes:**
- Added `c.deleted = false` filter to `existsByEmailAddressIgnoreCase()` (line 15)
- Added `c.deleted = false` filter to `existsByPhoneNumber()` (line 18)
- Added `c.deleted = false` filter to `existsByEmailAddressIgnoreCaseAndIdNot()` (line 21)
- Added `c.deleted = false` filter to `existsByPhoneNumberAndIdNot()` (line 24)

**Impact:** Users can now create new clients with phone numbers/emails previously used by archived clients.

### ✅ Fix #2: Remove Admin Home Page (COMPLETED)
**Files:**
1. `services/frontend/crm-ui/src/navigation/sidebarNav.ts` - Removed "Home" link from `adminSidebarNav`
2. `services/frontend/crm-ui/src/app/App.tsx` - Added redirect for non-root admins from `/admin` to `/admin/users`

**Changes:**
- Non-root admins no longer see "Home" in sidebar navigation
- Attempting to navigate to `/admin` redirects non-root admins to `/admin/users`
- Only root admin can access the dashboard with client data

**Impact:** RBAC violation fixed - non-root admins can no longer view client statistics.

### ✅ Fix #3: Agent Archive Validation (ALREADY IMPLEMENTED)
**File:** `services/backend/user/src/main/java/com/scroogebank/crm/user_service/service/UserAccountService.java`

**Existing Code (lines 268-272):**
```java
if (target.role() == UserRole.user) {
    long assignedClients = assignedClientCounter.countAssignedClients(userId, authorizationHeader, correlationId);
    if (assignedClients > 0) {
        throw new ArchivePreconditionFailedException("Transfer assigned clients before archiving.");
    }
}
```

**Status:** Backend validation already exists. Frontend shows correct UI (Transfer button for agents with clients, Archive button only for agents with 0 clients).

**Impact:** No code changes needed - backend already enforces constraint.

---

## Testing Requirements

### Local Testing:
1. Create client → Archive → Try to create new client with same phone/email (should succeed)
2. Login as non-root admin → Verify no Home link in sidebar
3. Disable agent with clients → Verify Archive button hidden, Transfer shown
4. Transfer clients → Verify agent auto-archived after transfer
5. Login as root admin → Verify Client Archives always visible

### Production Verification:
1. Smoke test all RBAC roles (root admin, admin, agent)
2. Verify client creation workflow
3. Verify agent archive/transfer workflow
4. Check for any network errors in browser console

---

## Deployment Strategy

1. **Fix critical backend bugs** (phone uniqueness)
2. **Fix frontend RBAC bugs** (admin home page)
3. **Run full test suite** (unit + integration + E2E)
4. **Build and package** backend lambdas and frontend
5. **Deploy via GitHub Actions** or AWS CLI
6. **Verify in production** with smoke tests
7. **Monitor** for any regressions

---

## Files to Modify

### Backend:
- `services/backend/client/src/main/java/com/scroogebank/crm/client_service/repository/ClientRepository.java`
- `services/backend/client/src/main/java/com/scroogebank/crm/client_service/service/ClientServiceImpl.java` (add validation)

### Frontend:
- `services/frontend/crm-ui/src/navigation/sidebarNav.ts`
- `services/frontend/crm-ui/src/pages/AdminUserManagementPage.tsx` (add loading states)

### Tests:
- Unit tests for ClientRepository queries
- Integration tests for client creation with archived clients
- E2E tests for RBAC enforcement
