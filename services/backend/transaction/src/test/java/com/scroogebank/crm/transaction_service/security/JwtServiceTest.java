package com.scroogebank.crm.transaction_service.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import tools.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Validates JWT minting and verification behavior.
 */
class JwtServiceTest {
	private static final String SECRET = "test-secret";
	private static final Clock FIXED_CLOCK = Clock.fixed(Instant.parse("2026-02-05T00:00:00Z"), ZoneOffset.UTC);

	private JwtService jwtService;
	private ObjectMapper objectMapper;

	@BeforeEach
	void setUp() {
		objectMapper = new ObjectMapper();
		jwtService = new JwtService(objectMapper, FIXED_CLOCK, SECRET);
	}

	@Test
	void verifyAndParse_validToken_returnsUser() {
		String token = jwtService.mintAccessToken("usr_1", "admin", FIXED_CLOCK.instant().plusSeconds(3600));

		AuthenticatedUser user = jwtService.verifyAndParse(token);

		assertEquals("usr_1", user.userId());
		assertEquals("admin", user.role());
	}

	@Test
	void verifyAndParse_expiredToken_throws() {
		String token = jwtService.mintAccessToken("usr_1", "admin", FIXED_CLOCK.instant().minusSeconds(1));

		assertThrows(JwtValidationException.class, () -> jwtService.verifyAndParse(token));
	}

	@Test
	void verifyAndParse_tamperedSignature_throws() {
		String token = jwtService.mintAccessToken("usr_1", "admin", FIXED_CLOCK.instant().plusSeconds(3600));
		String tampered = token.substring(0, token.length() - 2) + "aa";

		assertThrows(JwtValidationException.class, () -> jwtService.verifyAndParse(tampered));
	}

	@Test
	void verifyAndParse_invalidRole_throws() {
		String token = signedToken(Map.of(
			"sub", "usr_1",
			"role", "auditor",
			"iat", FIXED_CLOCK.instant().getEpochSecond(),
			"exp", FIXED_CLOCK.instant().plusSeconds(3600).getEpochSecond()
		));

		assertThrows(JwtValidationException.class, () -> jwtService.verifyAndParse(token));
	}

	@Test
	void verifyAndParse_invalidFormat_throws() {
		assertThrows(JwtValidationException.class, () -> jwtService.verifyAndParse("abc.def"));
	}

	@Test
	void verifyAndParse_unsupportedAlg_throws() throws Exception {
		String header = b64Json(Map.of("alg", "HS512", "typ", "JWT"));
		String payload = b64Json(Map.of(
			"sub", "usr_1",
			"role", "admin",
			"iat", FIXED_CLOCK.instant().getEpochSecond(),
			"exp", FIXED_CLOCK.instant().plusSeconds(3600).getEpochSecond()
		));

		assertThrows(JwtValidationException.class, () -> jwtService.verifyAndParse(header + "." + payload + ".AA"));
	}

	@Test
	void verifyAndParse_invalidBase64_throws() {
		assertThrows(JwtValidationException.class, () -> jwtService.verifyAndParse("**.a.a"));
	}

	@Test
	void verifyAndParse_invalidJson_throws() {
		String header = Base64.getUrlEncoder().withoutPadding().encodeToString("not-json".getBytes(StandardCharsets.UTF_8));
		String payload = Base64.getUrlEncoder().withoutPadding().encodeToString("{}".getBytes(StandardCharsets.UTF_8));
		assertThrows(JwtValidationException.class, () -> jwtService.verifyAndParse(header + "." + payload + ".AA"));
	}

	@Test
	void verifyAndParse_missingRequiredClaims_throws() {
		String token = signedToken(Map.of(
			"sub", "usr_1",
			"iat", FIXED_CLOCK.instant().getEpochSecond()
		));

		assertThrows(JwtValidationException.class, () -> jwtService.verifyAndParse(token));
	}

	@Test
	void verifyAndParse_withoutExp_allowsToken() {
		String token = signedToken(Map.of(
			"sub", "usr_1",
			"role", "user",
			"iat", FIXED_CLOCK.instant().getEpochSecond()
		));

		AuthenticatedUser user = jwtService.verifyAndParse(token);

		assertEquals("usr_1", user.userId());
		assertEquals("user", user.role());
	}

	@Test
	void verifyAndParse_invalidNumberClaim_throws() {
		String token = signedToken(Map.of(
			"sub", "usr_1",
			"role", "admin",
			"iat", FIXED_CLOCK.instant().getEpochSecond(),
			"exp", Map.of("n", 1)
		));

		assertThrows(JwtValidationException.class, () -> jwtService.verifyAndParse(token));
	}

	private String signedToken(Map<String, Object> payload) {
		try {
			String header = b64Json(Map.of("alg", "HS256", "typ", "JWT"));
			String body = b64Json(payload);
			String signingInput = header + "." + body;
			Mac mac = Mac.getInstance("HmacSHA256");
			mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
			byte[] signature = mac.doFinal(signingInput.getBytes(StandardCharsets.US_ASCII));
			return signingInput + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(signature);
		}
		catch (Exception ex) {
			throw new IllegalStateException(ex);
		}
	}

	private String b64Json(Map<String, Object> data) throws Exception {
		String json = objectMapper.writeValueAsString(data);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(json.getBytes(StandardCharsets.UTF_8));
	}
}

