package com.scroogebank.crm.client_service.service;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for {@link VerificationTokenService}: token generation and validation.
 */
class VerificationTokenServiceTest {

    private static final String CLIENT_ID = "clt_7";
    private static final String HMAC_SECRET = "dev-only-insecure-secret";

    private final VerificationTokenService verificationTokenService;

    VerificationTokenServiceTest() {
        Clock clock = Clock.fixed(Instant.now(), ZoneOffset.UTC);
        verificationTokenService = new VerificationTokenService(clock, HMAC_SECRET);
    }

    // ── Helper ───────────────────────────────────────────────────────────────

    /** Generates a real token using the service itself. */
    private String generateToken(String clientId, long ttlSeconds) {
        return verificationTokenService.generateVerificationToken(clientId, ttlSeconds);
    }

    // ── generateVerificationToken ─────────────────────────────────────────────

    /** Verifies that generateVerificationToken() returns a three-part dot-separated JWT-style string. */
    @Test
    void generateVerificationToken_returnsThreePartDotSeparatedToken() {
        String token = generateToken(CLIENT_ID, 3600);

        assertThat(token.split("\\.", -1)).hasSize(3);
    }

    /** Verifies that the generated token payload contains the correct clientId. */
    @Test
    void generateVerificationToken_payloadContainsCorrectClientId() throws Exception {
        String token   = generateToken(CLIENT_ID, 3600);
        String payload = decodePayload(token);

        assertThat(payload).contains("\"clientId\":\"clt_7\"");
    }

    /** Verifies that the generated token payload contains an exp in the future. */
    @Test
    void generateVerificationToken_payloadContainsExpInFuture() throws Exception {
        long before = Instant.now().getEpochSecond();
        String token = generateToken(CLIENT_ID, 3600);
        long after   = Instant.now().getEpochSecond();

        String payload = decodePayload(token);

        // Extract exp value from JSON string
        long exp = extractExp(payload);
        assertThat(exp).isGreaterThan(before);
        assertThat(exp).isLessThanOrEqualTo(after + 3600 + 1); // +1 for clock tolerance
    }

    /** Verifies that generateVerificationToken() throws IllegalArgumentException when clientId is null. */
    @Test
    void generateVerificationToken_nullClientId_throwsIllegalArgumentException() {
        assertThatThrownBy(() -> generateToken(null, 3600))
            .isInstanceOf(IllegalArgumentException.class);
    }

    /** Verifies that generateVerificationToken() throws IllegalArgumentException when ttlSeconds is negative num. */
    @Test
    void generateVerificationToken_negTTL_throwsIllegalArgumentException() {
        assertThatThrownBy(() -> generateToken(CLIENT_ID, -1))
            .isInstanceOf(IllegalArgumentException.class);
    }

    // ── isValid ────────────────────────────────────────────────

    /** Verifies that isValid() returns false when token is null. */
    @Test
    void isValid_tokenNull_returnsFalse() {
        assertThat(verificationTokenService.isValid(CLIENT_ID, null)).isFalse();
    }

    /** Verifies that isValid() returns false when token is blank. */
    @Test
    void isValid_tokenBlank_returnsFalse() {
        assertThat(verificationTokenService.isValid(CLIENT_ID, "   ")).isFalse();
    }

    /** Verifies that isValid() returns false when token is an empty string. */
    @Test
    void isValid_tokenEmpty_returnsFalse() {
        assertThat(verificationTokenService.isValid(CLIENT_ID, "")).isFalse();
    }

    /** Verifies that isValid() returns false when token is not Base64URL encoded. */
    @Test
    void isValid_tokenNotBase64_returnsFalse() {
        assertThat(verificationTokenService.isValid(CLIENT_ID, "not-a-jwt-at-all")).isFalse();
    }

    /** Verifies that isValid() returns false when token has only two parts instead of three. */
    @Test
    void isValid_tokenTwoParts_returnsFalse() {
        String onlyTwo = base64Url("header") + "." + base64Url("payload");
        assertThat(verificationTokenService.isValid(CLIENT_ID, onlyTwo)).isFalse();
    }

    /** Verifies that isValid() returns false when the payload is not valid JSON. */
    @Test
    void isValid_payloadNotJson_returnsFalse() {
        String badPayload = base64Url("header") + "." + base64Url("not-json") + "." + base64Url("sig");
        assertThat(verificationTokenService.isValid(CLIENT_ID, badPayload)).isFalse();
    }

    /** Verifies that isValid() returns false when the payload is missing the clientId field. */
    @Test
    void isValid_payloadMissingClientId_returnsFalse() {
        long exp          = Instant.now().getEpochSecond() + 3600;
        String badPayload = base64Url("header")
            + "." + base64Url("{\"exp\":" + exp + "}")
            + "." + base64Url("sig");

        assertThat(verificationTokenService.isValid(CLIENT_ID, badPayload)).isFalse();
    }

    /** Verifies that isValid() returns false when the payload is missing the exp field. */
    @Test
    void isValid_payloadMissingExp_returnsFalse() {
        String badPayload = base64Url("header")
            + "." + base64Url("{\"clientId\":\"clt_7\"}")
            + "." + base64Url("sig");

        assertThat(verificationTokenService.isValid(CLIENT_ID, badPayload)).isFalse();
    }

    /** Verifies that isValid() returns false when the token clientId does not match the given clientId. */
    @Test
    void isValid_clientIdMismatch_returnsFalse() {
        String token = generateToken("clt_other", 3600);

        assertThat(verificationTokenService.isValid(CLIENT_ID, token)).isFalse();
    }

    /** Verifies that isValid() returns false when the token is expired. */
    @Test
    void isValid_tokenExpired_returnsFalse() {
        Clock fixedClock = Clock.fixed(Instant.now(), ZoneOffset.UTC);
        String expiredToken = generateToken(CLIENT_ID, 3600); // valid for 1 hour

        // Move time forward 2 hours
        Clock futureClock = Clock.offset(fixedClock, Duration.ofHours(2));
        VerificationTokenService service = new VerificationTokenService(futureClock, HMAC_SECRET);

        assertThat(service.isValid(CLIENT_ID, expiredToken)).isFalse();
    }

    /** Verifies that isValid() returns true for a freshly generated token. */
    @Test
    void isValid_validToken_returnsTrue() {
        String token = generateToken(CLIENT_ID, 3600);

        assertThat(verificationTokenService.isValid(CLIENT_ID, token)).isTrue();
    }

    @Test
    void consumeIfValid_validToken_firstUseTrue_secondUseFalse() {
        String token = generateToken(CLIENT_ID, 3600);

        assertThat(verificationTokenService.consumeIfValid(CLIENT_ID, token)).isTrue();
        assertThat(verificationTokenService.consumeIfValid(CLIENT_ID, token)).isFalse();
    }

    @Test
    void consumeIfValid_invalidToken_returnsFalse() {
        assertThat(verificationTokenService.consumeIfValid(CLIENT_ID, "bad-token")).isFalse();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private static String base64Url(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes());
    }

    private static String decodePayload(String token) {
        String[] parts = token.split("\\.", 3);
        return new String(Base64.getUrlDecoder().decode(parts[1]));
    }

    private static long extractExp(String payloadJson) {
        String expPart = payloadJson.split("\"exp\":")[1].split(",")[0].replace("}", "").trim();
        return Long.parseLong(expPart);
    }
}
