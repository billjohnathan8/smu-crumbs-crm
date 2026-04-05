# P0-1 Evidence: Remove fallback/default PII encryption behavior

Date: 2026-04-05
Scope: backlog item P0-1 only

## Control implemented
- Removed predictable fallback/default PII key behavior.
- Enforced fail-closed key validation for `PII_ENCRYPTION_KEY`.
  - key is required
  - key must be valid Base64
  - decoded key must be exactly 32 bytes (AES-256)
- Removed fail-open decrypt behavior that previously returned raw input on crypto errors.
- Added startup-time validation to fail application context initialization when key is missing/invalid.

## Code evidence
- Runtime crypto enforcement:
  - `services/backend/client/src/main/java/com/scroogebank/crm/client_service/crypto/EncryptedStringConverter.java`
- Startup fail-closed validator:
  - `services/backend/client/src/main/java/com/scroogebank/crm/client_service/crypto/PiiEncryptionStartupValidator.java`

## Automated proof executed
Command executed from `services/backend/client`:

```powershell
.\gradlew.bat test --tests "com.scroogebank.crm.client_service.crypto.EncryptedStringConverterTest" --tests "com.scroogebank.crm.client_service.crypto.PiiEncryptionStartupValidatorTest" --tests "com.scroogebank.crm.client_service.ClientsServiceApplicationTests"
```

Result:
- Build status: `BUILD SUCCESSFUL`
- Assertions covered:
  - missing key path fails safely
  - invalid key path fails safely
  - valid key path encrypt/decrypt and startup path works

## Test files updated/added for this control
- `services/backend/client/src/test/java/com/scroogebank/crm/client_service/crypto/EncryptedStringConverterTest.java`
- `services/backend/client/src/test/java/com/scroogebank/crm/client_service/crypto/PiiEncryptionStartupValidatorTest.java`
- `services/backend/client/src/test/java/com/scroogebank/crm/client_service/ClientsServiceApplicationTests.java`

## Notes
- No migration-style fail-open decrypt path remains in runtime code.
