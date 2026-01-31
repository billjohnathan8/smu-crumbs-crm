# Clients Service (Local Setup & Testing)

This service implements the client CRUD endpoints defined in
`docs/api-contracts/openapi/client.yaml`.

## Prerequisites
- Java 21
- Docker Desktop

## Quick start (local)

### 1) Start PostgreSQL
From the repo root:
```powershell
docker run --rm -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=clients postgres
```

### 2) Run the service
```powershell
cd services/clients-service
.\gradlew.bat bootRun
```

The service listens on `http://localhost:8080`.

## Environment variables (optional)
Defaults are set in `src/main/resources/application.yaml`.

- `DB_URL` (default: `jdbc:postgresql://localhost:5432/clients`)
- `DB_USERNAME` (default: `postgres`)
- `DB_PASSWORD` (default: `postgres`)
- `SERVER_PORT` (default: `8080`)

## Testing with Postman

### Health check
Request:
- Method: `GET`
- URL: `http://localhost:8080/api/v1/health`

Expected response body:
```
{ "status": "ok" }
```

### Create client
Request:
- Method: `POST`
- URL: `http://localhost:8080/api/v1/clients`
- Headers: `Content-Type: application/json`
- Body (raw JSON):
```json
{
  "client": {
    "firstName": "Jane",
    "lastName": "Doe",
    "dateOfBirth": "1990-01-01",
    "gender": "Female",
    "emailAddress": "jane.doe@example.com",
    "phoneNumber": "+12345678901",
    "address": "123 Main St",
    "city": "Singapore",
    "state": "Central",
    "country": "Singapore",
    "postalCode": "12345"
  },
  "agentId": "agent-123"
}
```

### List clients
Request:
- Method: `GET`
- URL: `http://localhost:8080/api/v1/clients`

### Get client by ID
Request:
- Method: `GET`
- URL: `http://localhost:8080/api/v1/clients/{id}`

### Update client
Request:
- Method: `PUT`
- URL: `http://localhost:8080/api/v1/clients/{id}`
- Headers: `Content-Type: application/json`
- Body: same as create

### Delete client
Request:
- Method: `DELETE`
- URL: `http://localhost:8080/api/v1/clients/{id}`
- Headers: `Content-Type: application/json`
- Body (optional):
```json
{ "agentId": "agent-123" }
```

## Notes
- Security is temporarily disabled for local testing via
  `src/main/java/com/itsa/crm/clients_service/config/SecurityConfig.java`.
  Replace this with OAuth2/JWT config later.
- Flyway runs automatically on startup and applies `V1__create_clients.sql`.

testing ci