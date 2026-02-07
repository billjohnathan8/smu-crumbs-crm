# User Flows

This document describes the key user journeys in the CRM UI frontend.

## Admin User Flows

### 1. Admin Login Flow

```mermaid
flowchart TD
    Start([User visits /login]) --> EnterCreds[Enter email + password]
    EnterCreds --> Validate{Valid format?}
    Validate -->|No| ShowError[Show field errors]
    ShowError --> EnterCreds
    Validate -->|Yes| Submit[Submit form]
    Submit --> API{API call}
    API -->|Success| StoreToken[Store token + user data]
    StoreToken --> RedirectAdmin[Redirect to /admin]
    RedirectAdmin --> End([Admin Dashboard])
    API -->|401| ShowAuthError[Show 'Invalid credentials']
    ShowAuthError --> EnterCreds
    API -->|Timeout| ShowTimeout[Show 'Request timed out']
    ShowTimeout --> EnterCreds
```

### 2. Admin View Dashboard Flow

```mermaid
flowchart TD
    Start([Admin Dashboard loads]) --> FetchData[Fetch stats + logs]
    FetchData --> ParallelAPI{Parallel API calls}
    ParallelAPI --> Users[GET /api/agents<br/>limit=1]
    ParallelAPI --> Clients[GET /api/clients<br/>limit=1]
    ParallelAPI --> Logs[GET /api/logs<br/>limit=10]
    Users --> Aggregate[Aggregate results]
    Clients --> Aggregate
    Logs --> Aggregate
    Aggregate --> Display[Display stats + table]
    Display --> End([Dashboard ready])

    ParallelAPI -->|Error 401| Logout[Clear tokens]
    Logout --> RedirectLogin[Redirect to /login]
    RedirectLogin --> LoginEnd([Login Page])

    ParallelAPI -->|Other Error| ShowError[Display error banner]
    ShowError --> End
```

### 3. Admin Manage Accounts Flow

```mermaid
flowchart TD
    Start([Admin clicks 'Manage Accounts']) --> LoadPage[Navigate to /admin/accounts]
    LoadPage --> FetchUsers[GET /api/agents?limit=10&offset=0]
    FetchUsers -->|Success| DisplayTable[Display user table]
    DisplayTable --> Action{User action?}

    Action -->|Create| OpenModal[Open create modal]
    OpenModal --> FillForm[Fill form fields]
    FillForm --> ValidateForm{Valid?}
    ValidateForm -->|No| ShowFormErrors[Show validation errors]
    ShowFormErrors --> FillForm
    ValidateForm -->|Yes| PostUser[POST /api/agents]
    PostUser -->|Success| RefreshList[Refresh user list]
    RefreshList --> CloseModal[Close modal]
    CloseModal --> DisplayTable
    PostUser -->|409| ShowDuplicate[Show 'User already exists']
    ShowDuplicate --> FillForm

    Action -->|Disable| ConfirmDisable{Confirm?}
    ConfirmDisable -->|Yes| DisableAPI[POST /api/agents/:id/disable]
    DisableAPI --> RefreshList
    ConfirmDisable -->|No| DisplayTable

    Action -->|Delete| ConfirmDelete{Confirm?}
    ConfirmDelete -->|Yes| DeleteAPI[DELETE /api/agents/:id]
    DeleteAPI --> RefreshList
    ConfirmDelete -->|No| DisplayTable

    Action -->|Reset PW| ConfirmReset{Confirm?}
    ConfirmReset -->|Yes| ResetAPI[POST /api/agents/:id/reset-password]
    ResetAPI --> ShowSuccess[Show 'Email sent']
    ShowSuccess --> DisplayTable
    ConfirmReset -->|No| DisplayTable

    Action -->|Paginate| ChangePage[Change page offset]
    ChangePage --> FetchUsers

    Action -->|Back| BackToDash[Navigate to /admin]
    BackToDash --> End([Admin Dashboard])
```

## Agent User Flows

### 4. Agent Login Flow

```mermaid
flowchart TD
    Start([User visits /login]) --> EnterCreds[Enter email + password]
    EnterCreds --> Validate{Valid format?}
    Validate -->|No| ShowError[Show field errors]
    ShowError --> EnterCreds
    Validate -->|Yes| Submit[Submit form]
    Submit --> API{API call}
    API -->|Success| StoreToken[Store token + user data]
    StoreToken --> RedirectAgent[Redirect to /agent]
    RedirectAgent --> End([Agent Dashboard])
    API -->|401| ShowAuthError[Show 'Invalid credentials']
    ShowAuthError --> EnterCreds
```

### 5. Agent View Dashboard Flow

```mermaid
flowchart TD
    Start([Agent Dashboard loads]) --> FetchData[Fetch stats + logs]
    FetchData --> ParallelAPI{Parallel API calls}
    ParallelAPI --> Clients[GET /api/clients<br/>limit=1]
    ParallelAPI --> Logs[GET /api/logs<br/>limit=10&agentId=xxx]
    Clients --> Aggregate[Aggregate results]
    Logs --> Aggregate
    Aggregate --> Display[Display stats + table]
    Display --> End([Dashboard ready])

    ParallelAPI -->|Error 401| Logout[Clear tokens]
    Logout --> RedirectLogin[Redirect to /login]
    RedirectLogin --> LoginEnd([Login Page])

    ParallelAPI -->|Other Error| ShowError[Display error banner]
    ShowError --> End
```

### 6. Agent Create Client Flow

```mermaid
flowchart TD
    Start([Agent clicks 'Create Client']) --> LoadPage[Navigate to /agent/clients/new]
    LoadPage --> ShowForm[Display empty form]
    ShowForm --> FillForm[Fill 11 required fields]
    FillForm --> Submit[Click 'Create Client']
    Submit --> Validate{Validate all fields}

    Validate -->|Missing required| ShowRequired[Show 'Field is required']
    ShowRequired --> FillForm

    Validate -->|Invalid email| ShowEmailError[Show 'Invalid email format']
    ShowEmailError --> FillForm

    Validate -->|Invalid phone| ShowPhoneError[Show 'Invalid phone format']
    ShowPhoneError --> FillForm

    Validate -->|Age < 18| ShowAgeError[Show 'Must be 18+']
    ShowAgeError --> FillForm

    Validate -->|Age > 100| ShowMaxAge[Show 'Cannot exceed 100']
    ShowMaxAge --> FillForm

    Validate -->|Valid| PostClient[POST /api/clients]
    PostClient -->|Success| RedirectSuccess[Redirect to /agent]
    RedirectSuccess --> ShowSuccessBanner[Show 'Client created']
    ShowSuccessBanner --> End([Agent Dashboard])

    PostClient -->|409| ShowDuplicate[Show 'Client already exists']
    ShowDuplicate --> FillForm

    PostClient -->|422| ShowValidation[Show 'Invalid data']
    ShowValidation --> FillForm

    PostClient -->|401| Logout[Clear tokens]
    Logout --> RedirectLogin[Redirect to /login]

    FillForm --> Cancel{Click Cancel?}
    Cancel -->|Yes| RedirectCancel[Navigate to /agent]
    RedirectCancel --> End
    Cancel -->|No| FillForm
```

### 7. Agent View Transactions Flow

```mermaid
flowchart TD
    Start([Agent clicks 'View Transactions']) --> LoadPage[Navigate to /agent/transactions]
    LoadPage --> FetchTxns[GET /api/transactions?limit=20&offset=0]
    FetchTxns -->|Success| DisplayTable[Display transaction table]
    DisplayTable --> Action{User action?}

    Action -->|Search| TypeSearch[Type client/txn ID]
    TypeSearch --> ClientFilter[Filter client-side]
    ClientFilter --> DisplayFiltered[Display filtered results]
    DisplayFiltered --> Action

    Action -->|Filter Status| SelectStatus[Select status dropdown]
    SelectStatus --> ApplyFilter[Apply filter param]
    ApplyFilter --> RefreshAPI[Fetch with new params]
    RefreshAPI --> DisplayTable

    Action -->|Filter Type| SelectType[Select D or W]
    SelectType --> ApplyFilter

    Action -->|Filter Date| EnterDates[Enter from/to dates]
    EnterDates --> ApplyFilter

    Action -->|Reset| ClearFilters[Clear all filters]
    ClearFilters --> FetchTxns

    Action -->|Paginate| ChangePage[Change page offset]
    ChangePage --> FetchTxns

    Action -->|Back| BackToDash[Navigate to /agent]
    BackToDash --> End([Agent Dashboard])

    FetchTxns -->|Empty| ShowEmpty[Show 'No transactions found']
    ShowEmpty --> Action

    FetchTxns -->|Error| ShowError[Show error banner]
    ShowError --> Action
```

## Common Flows

### 8. Logout Flow

```mermaid
flowchart TD
    Start([User clicks 'Logout']) --> ClearAuth[Clear auth tokens]
    ClearAuth --> ClearUser[Clear user data]
    ClearUser --> Navigate[Navigate to /login]
    Navigate --> End([Login Page])
```

### 9. Protected Route Access Flow

```mermaid
flowchart TD
    Start([User navigates to protected route]) --> CheckAuth{Authenticated?}
    CheckAuth -->|No| RedirectLogin[Redirect to /login]
    RedirectLogin --> LoginEnd([Login Page])

    CheckAuth -->|Yes| CheckRole{Correct role?}
    CheckRole -->|No| Show403[Show Access Denied]
    Show403 --> End403([403 Page])

    CheckRole -->|Yes| RenderPage[Render protected page]
    RenderPage --> End([Protected Content])
```

### 10. API Error Handling Flow

```mermaid
flowchart TD
    Start([API call initiated]) --> Request[Send HTTP request]
    Request --> Timeout{Timeout?}
    Timeout -->|Yes after 5s| ShowTimeout[Show 'Request timed out']
    ShowTimeout --> End([User sees error])

    Timeout -->|No| Response{Response status?}
    Response -->|200-299| Success[Parse JSON]
    Success --> End2([Success state])

    Response -->|401| Unauthorized[Trigger logout]
    Unauthorized --> ClearTokens[Clear tokens]
    ClearTokens --> RedirectLogin[Redirect to /login]
    RedirectLogin --> End3([Login Page])

    Response -->|403| Forbidden[Show 'Access denied']
    Forbidden --> End

    Response -->|409| Conflict[Show 'Resource already exists']
    Conflict --> End

    Response -->|422| Validation[Show 'Invalid data']
    Validation --> End

    Response -->|500| ServerError[Show 'Server error occurred']
    ServerError --> End

    Response -->|Other| GenericError[Show error message]
    GenericError --> End
```

## User Journey Summary

### Admin Journey

1. Login with admin credentials
2. View dashboard (stats + recent logs)
3. Navigate to Manage Accounts
4. Create new agent user
5. View user list with pagination
6. Disable/delete users as needed
7. Reset user passwords
8. Logout

**Key Actions:**
- User CRUD operations
- View all system activity
- Manage agent accounts

**Performance Target:** Page loads <= 5s

### Agent Journey

1. Login with agent credentials
2. View dashboard (client count + own activity)
3. Navigate to Create Client
4. Fill out comprehensive client form
5. Submit with validation (18-100 years, email, phone)
6. Return to dashboard
7. Navigate to View Transactions
8. Filter by status, type, date range
9. Search by client ID
10. Logout

**Key Actions:**
- Create client profiles
- View transactions (own clients only)
- Filter and search transactions

**Performance Target:** Page loads <= 5s

## Error Scenarios

### Network Errors
- Request timeout (5s) → Show retry message
- Network failure → Show connection error
- Server down → Show service unavailable

### Authentication Errors
- Invalid credentials → Show error, stay on login
- Session expired → Auto-logout, redirect to login
- Token missing → Redirect to login

### Authorization Errors
- Wrong role → Show 403 Access Denied
- Resource not owned → Show 403 error

### Validation Errors
- Client-side validation → Show field-level errors
- Server-side validation (422) → Show general error
- Duplicate resource (409) → Show conflict message

### Data Errors
- Empty results → Show "No data found" state
- Pagination overflow → Clamp to valid page
- Invalid filter params → Clear filters, show all

## Accessibility Considerations

- All forms have labels
- Error messages associated with fields
- Loading states clearly indicated
- Keyboard navigation supported
- Focus management on modals

## Performance Optimizations

- Parallel API calls for dashboard stats
- Pagination to limit data transfer
- Client-side search filter (no API roundtrip)
- Image assets cached (1 year)
- HTML not cached (SPA)
- Request timeout enforced (5s max)
