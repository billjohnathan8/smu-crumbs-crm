package com.scroogebank.crm.agentservice.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import tools.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link JwtService}.
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
	void verifyAndParse_superAdminRole_returnsNormalizedRole() {
		String token = jwtService.mintAccessToken("usr_1", "super_admin", FIXED_CLOCK.instant().plusSeconds(3600));

		AuthenticatedUser user = jwtService.verifyAndParse(token);

		assertEquals("usr_1", user.userId());
		assertEquals("super_admin", user.role());
	}

	@Test
	void verifyAndParse_legacySuperadminRole_isAcceptedAndNormalized() {
		String token = signedToken(Map.of(
			"sub", "usr_1",
			"role", "superadmin",
			"iat", FIXED_CLOCK.instant().getEpochSecond(),
			"exp", FIXED_CLOCK.instant().plusSeconds(3600).getEpochSecond()
		));

		AuthenticatedUser user = jwtService.verifyAndParse(token);

		assertEquals("usr_1", user.userId());
		assertEquals("super_admin", user.role());
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
	void verifyAndParse_unsupportedAlg_throws() {
		String header = b64Raw("{\"alg\":\"none\",\"typ\":\"JWT\"}");
		String body = b64Raw("{}");
		String token = header + "." + body + "." + b64Raw("x");

		assertThrows(JwtValidationException.class, () -> jwtService.verifyAndParse(token));
	}

	@Test
	void verifyAndParse_invalidBase64Header_throws() {
		String token = "%%%." + b64Raw("{}") + "." + b64Raw("x");

		assertThrows(JwtValidationException.class, () -> jwtService.verifyAndParse(token));
	}

	@Test
	void verifyAndParse_invalidJsonHeader_throws() {
		String token = b64Raw("not-json") + "." + b64Raw("{}") + "." + b64Raw("x");

		assertThrows(JwtValidationException.class, () -> jwtService.verifyAndParse(token));
	}

	@Test
	void verifyAndParse_missingRequiredClaims_throws() {
		String token = signedToken(Map.of(
			"sub", "usr_1",
			"exp", FIXED_CLOCK.instant().plusSeconds(3600).getEpochSecond()
		));

		assertThrows(JwtValidationException.class, () -> jwtService.verifyAndParse(token));
	}

	@Test
	void verifyAndParse_invalidExpClaimType_throws() {
		String token = signedToken(Map.of(
			"sub", "usr_1",
			"role", "admin",
			"exp", true
		));

		assertThrows(JwtValidationException.class, () -> jwtService.verifyAndParse(token));
	}

	@Test
	void verifyAndParse_noExpClaim_isAllowed() {
		String token = signedToken(Map.of(
			"sub", "usr_1",
			"role", "admin",
			"nonce", UUID.randomUUID().toString()
		));

		AuthenticatedUser user = jwtService.verifyAndParse(token);

		assertEquals("usr_1", user.userId());
		assertEquals("admin", user.role());
	}

	private String signedToken(Map<String, Object> payload) {
		return signedToken(Map.of("alg", "HS256", "typ", "JWT"), payload);
	}

	private String signedToken(Map<String, Object> header, Map<String, Object> payload) {
		try {
			String headerPart = b64Json(header);
			String bodyPart = b64Json(payload);
			String signingInput = headerPart + "." + bodyPart;
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

	private static String b64Raw(String value) {
		return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
	}
}
