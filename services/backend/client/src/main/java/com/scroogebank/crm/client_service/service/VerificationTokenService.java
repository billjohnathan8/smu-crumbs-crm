package com.scroogebank.crm.client_service.service;

import java.time.Clock;
import java.time.Instant;
import java.util.Base64;

import com.fasterxml.jackson.databind.ObjectMapper;

// **How the token is structured:**
// ```
// Header:    {"alg":"none","typ":"JWT"}   →  Base64Url  →  eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0
// Payload:   {"clientId":"clt_7","exp":1735689600}  →  Base64Url  →  eyJjbGllbnRJZCI6ImNsdF83IiwiZXhwIjoxNzM1Njg5NjAwfQ
// Signature: placeholder  →  Base64Url  →  cGxhY2Vob2xkZXI

// Final token:  eyJhbGc....eyJjbGll....cGxhY2U
//                   │            │           │
//                header       payload    signature (TODO: HMAC)

public class VerificationTokenService {

    private final Clock clock;

    public VerificationTokenService(Clock clock) {
        this.clock = clock;
    }

    /**
     * Generates a JWT-style verification token for the given clientId.
     * Format: Base64Url(header).Base64Url({"clientId":"...","exp":...}).Base64Url(signature)
     * Signature is a placeholder — replace with real HMAC signing in production.
     *
     * @param clientId   the public client identifier
     * @param ttlSeconds how long the token is valid for (e.g. 86400 = 24 hours)
     * @return dot-separated JWT-style token string
     */
    public String generateVerificationToken(String clientId, long ttlSeconds) {
        if (clientId == null || clientId.isBlank()) {
            throw new IllegalArgumentException("clientId cannot be null");
        }

        if (ttlSeconds <= 0) {
            throw new IllegalArgumentException("ttlSeconds must be positive");
        }

        try {
            Instant now = Instant.now(clock);
            Instant expInstant = now.plusSeconds(ttlSeconds);
            long exp = expInstant.getEpochSecond();

            String header    = Base64.getUrlEncoder().withoutPadding()
                                .encodeToString("{\"alg\":\"none\",\"typ\":\"JWT\"}".getBytes());
            String payload   = Base64.getUrlEncoder().withoutPadding()
                                .encodeToString(
                                    ("{\"clientId\":\"" + clientId + "\",\"exp\":" + exp + "}").getBytes()
                                );
            String signature = Base64.getUrlEncoder().withoutPadding()
                                .encodeToString("placeholder".getBytes()); // TODO: replace with HMAC

            return header + "." + payload + "." + signature;
        } catch (Exception e) {
            throw new RuntimeException("Failed to generate verification token", e);
        }
    }

    /**
     * Validates that the given token is valid for the given clientId.
	 ** Token format: Base64(header).Base64({"clientId":"clt_x","exp":1735689600}).Base64(signature)
     * Signature is not verified — this is a mock implementation.
     * TODO: verify signature with a real JWT library (e.g. jjwt, nimbus-jose-jwt).
     *
     * @param clientId the public client identifier
     * @param token    the token from the email link (may be null if not provided)
     * @return true if valid or no token required, false otherwise
     */
	public boolean isValid(String clientId, String token) {
		if (token == null || token.isBlank()) {
			return false; // token is required
		}

		try {
			// 1. Split into 3 parts: header.payload.signature
            String[] parts = token.split("\\.", 3);
            if (parts.length != 3) {
                return false;
            }

            // 2. Decode payload (index 1) — Base64URL encoded
            byte[] decodedBytes = Base64.getUrlDecoder().decode(parts[1]);
            String payloadJson  = new String(decodedBytes);

            // 3. Parse payload JSON
            ObjectMapper mapper  = new ObjectMapper();
            TokenPayload payload = mapper.readValue(payloadJson, TokenPayload.class);

            // 4. Check clientId matches
            if (!clientId.equals(payload.clientId())) {
                return false;
            }

            // 5. Check token has not expired
            return Instant.now(clock).getEpochSecond() < payload.exp();

		} catch (Exception e) {
			// Catches both Base64 decode errors and Long.parseLong errors
			return false;
    	}
	}

    /** JWT payload record. */
    private record TokenPayload(String clientId, long exp) {}
}
