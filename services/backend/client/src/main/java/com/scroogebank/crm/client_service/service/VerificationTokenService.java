package com.scroogebank.crm.client_service.service;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

@Component
public class VerificationTokenService {

    private final Clock clock;
    private final byte[] secret;
    private final JsonMapper jsonMapper;
    private final ConcurrentMap<String, Long> consumedTokenHashesByExpiry;

    public VerificationTokenService(
        Clock clock,
        @Value("${app.jwt.hmac-secret:}") String hmacSecret
    ) {
        this.clock = clock;
        this.secret = hmacSecret.getBytes(StandardCharsets.UTF_8);
        this.jsonMapper = new JsonMapper();
        this.consumedTokenHashesByExpiry = new ConcurrentHashMap<>();
    }

    /**
     * Generates a JWT verification token for the given clientId.
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
            long exp = now.plusSeconds(ttlSeconds).getEpochSecond();
            String jti = UUID.randomUUID().toString();

            String header = encodeBase64Url("{\"alg\":\"HS256\",\"typ\":\"JWT\"}");
            String payload = encodeBase64Url(
                "{\"clientId\":\"" + clientId + "\",\"exp\":" + exp + ",\"jti\":\"" + jti + "\"}"
            );
            String signingInput = header + "." + payload;
            String signature = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(hmacSha256(signingInput.getBytes(StandardCharsets.US_ASCII)));
            return signingInput + "." + signature;
        }
        catch (Exception e) {
            throw new RuntimeException("Failed to generate verification token", e);
        }
    }

    /**
     * Validates token signature + claims without consuming it.
     */
    public boolean isValid(String clientId, String token) {
        return validateParsedPayload(clientId, token) != null;
    }

    /**
     * Validates and atomically consumes a token for one-time usage.
     */
    public boolean consumeIfValid(String clientId, String token) {
        TokenPayload payload = validateParsedPayload(clientId, token);
        if (payload == null) {
            return false;
        }
        evictExpiredConsumedTokens();

        String tokenHash = sha256Hex(token);
        Long previous = consumedTokenHashesByExpiry.putIfAbsent(tokenHash, payload.exp());
        return previous == null;
    }

    private TokenPayload validateParsedPayload(String clientId, String token) {
        if (token == null || token.isBlank() || clientId == null || clientId.isBlank()) {
            return null;
        }
        try {
            String[] parts = token.split("\\.", 3);
            if (parts.length != 3) {
                return null;
            }

            String signingInput = parts[0] + "." + parts[1];
            byte[] expectedSig = hmacSha256(signingInput.getBytes(StandardCharsets.US_ASCII));
            byte[] providedSig = Base64.getUrlDecoder().decode(parts[2]);
            if (!MessageDigest.isEqual(expectedSig, providedSig)) {
                return null;
            }

            String payloadJson = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
            TokenPayload payload = jsonMapper.readValue(payloadJson, TokenPayload.class);
            if (payload.clientId() == null || payload.clientId().isBlank() || payload.exp() <= 0) {
                return null;
            }
            if (!clientId.equals(payload.clientId())) {
                return null;
            }
            return Instant.now(clock).getEpochSecond() < payload.exp() ? payload : null;
        }
        catch (IllegalArgumentException | JacksonException e) {
            return null;
        }
    }

    private void evictExpiredConsumedTokens() {
        long now = Instant.now(clock).getEpochSecond();
        consumedTokenHashesByExpiry.entrySet().removeIf(entry -> entry.getValue() <= now);
    }

    private static String encodeBase64Url(String value) {
        return Base64.getUrlEncoder().withoutPadding()
            .encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static String sha256Hex(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(token.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        }
        catch (GeneralSecurityException e) {
            throw new IllegalStateException("Failed to hash token", e);
        }
    }

    private byte[] hmacSha256(byte[] data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return mac.doFinal(data);
        }
        catch (GeneralSecurityException e) {
            throw new IllegalStateException("Failed to compute HMAC-SHA256", e);
        }
    }

    /** JWT payload record. */
    private record TokenPayload(String clientId, long exp, String jti) {}
}
