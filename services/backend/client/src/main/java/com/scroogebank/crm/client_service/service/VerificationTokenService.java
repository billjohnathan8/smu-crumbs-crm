package com.scroogebank.crm.client_service.service;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

// **How the token is structured:**
// ```
// Header:    {"alg":"HS256","typ":"JWT"}  →  Base64Url
// Payload:   {"clientId":"clt_7","exp":1735689600}  →  Base64Url
// Signature: HMAC-SHA256(header.payload, secret)  →  Base64Url
//
// Final token:  <header>.<payload>.<signature>
//                  │         │          │
//               header    payload   HMAC-SHA256

@Component
public class VerificationTokenService {

    private final Clock clock;
    private final byte[] secret;

    public VerificationTokenService(Clock clock,
            @Value("${app.jwt.hmac-secret:dev-only-insecure-secret}") String hmacSecret) {
        this.clock = clock;
        this.secret = hmacSecret.getBytes(StandardCharsets.UTF_8);
    }

    /**
     * Generates a JWT verification token for the given clientId.
     * Format: Base64Url(header).Base64Url({"clientId":"...","exp":...}).Base64Url(HMAC-SHA256)
     *
     * @param clientId   the public client identifier
     * @param ttlSeconds how long the token is valid for (e.g. 86400 = 24 hours)
     * @return dot-separated JWT token string
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
                                .encodeToString("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes());
            String payload   = Base64.getUrlEncoder().withoutPadding()
                                .encodeToString(
                                    ("{\"clientId\":\"" + clientId + "\",\"exp\":" + exp + "}").getBytes()
                                );
            String signingInput = header + "." + payload;
            String signature = Base64.getUrlEncoder().withoutPadding()
                                .encodeToString(hmacSha256(signingInput.getBytes(StandardCharsets.US_ASCII)));

            return signingInput + "." + signature;
        } catch (Exception e) {
            throw new RuntimeException("Failed to generate verification token", e);
        }
    }

    /**
     * Validates that the given token is valid for the given clientId.
     * Verifies the HMAC-SHA256 signature, clientId match, and expiration.
     *
     * @param clientId the public client identifier
     * @param token    the token from the email link (may be null if not provided)
     * @return true if valid, false otherwise
     */
	public boolean isValid(String clientId, String token) {
		if (token == null || token.isBlank()) {
			return false;
		}

		try {
			// 1. Split into 3 parts: header.payload.signature
            String[] parts = token.split("\\.", 3);
            if (parts.length != 3) {
                return false;
            }

            // 2. Verify HMAC-SHA256 signature
            String signingInput = parts[0] + "." + parts[1];
            byte[] expectedSig = hmacSha256(signingInput.getBytes(StandardCharsets.US_ASCII));
            byte[] providedSig = Base64.getUrlDecoder().decode(parts[2]);
            if (!MessageDigest.isEqual(expectedSig, providedSig)) {
                return false;
            }

            // 3. Decode payload (index 1) — Base64URL encoded
            byte[] decodedBytes = Base64.getUrlDecoder().decode(parts[1]);
            String payloadJson  = new String(decodedBytes);

            // 4. Parse payload JSON
            ObjectMapper mapper  = new ObjectMapper();
            TokenPayload payload = mapper.readValue(payloadJson, TokenPayload.class);

            // 5. Check clientId matches
            if (!clientId.equals(payload.clientId())) {
                return false;
            }

            // 6. Check token has not expired
            return Instant.now(clock).getEpochSecond() < payload.exp();

		} catch (IllegalArgumentException | JsonProcessingException e) {
			return false;
    	}
	}

    private byte[] hmacSha256(byte[] data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return mac.doFinal(data);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Failed to compute HMAC-SHA256", e);
        }
    }

    /** JWT payload record. */
    private record TokenPayload(String clientId, long exp) {}
}
