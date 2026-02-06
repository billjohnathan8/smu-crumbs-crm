package com.itsa.crm.clients_service.security;

import tools.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtServiceTest {
	private static final String SECRET = "test-secret";

	private static String base64Url(String s) {
		return Base64.getUrlEncoder().withoutPadding().encodeToString(s.getBytes(StandardCharsets.UTF_8));
	}

	private static String hmacSha256(String signingInput, String secret) throws Exception {
		Mac mac = Mac.getInstance("HmacSHA256");
		mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
		return Base64.getUrlEncoder()
			.withoutPadding()
			.encodeToString(mac.doFinal(signingInput.getBytes(StandardCharsets.US_ASCII)));
	}

	private static String mintToken(
		ObjectMapper mapper,
		String secret,
		Map<String, Object> header,
		Map<String, Object> claims
	) throws Exception {
		String headerJson = mapper.writeValueAsString(header);
		String payloadJson = mapper.writeValueAsString(claims);
		String headerPart = base64Url(headerJson);
		String payloadPart = base64Url(payloadJson);
		String signingInput = headerPart + "." + payloadPart;
		return signingInput + "." + hmacSha256(signingInput, secret);
	}

	@Test
	void verifyAndParse_validToken_returnsUser() {
		Clock clock = Clock.fixed(Instant.parse("2026-02-05T00:00:00Z"), ZoneOffset.UTC);
		JwtService jwtService = new JwtService(new ObjectMapper(), clock, SECRET);

		String token = jwtService.mintForTests("usr_1", "admin", clock.instant().plusSeconds(3600));
		AuthenticatedUser user = jwtService.verifyAndParse(token);

		assertThat(user.userId()).isEqualTo("usr_1");
		assertThat(user.role()).isEqualTo("admin");
	}

	@Test
	void verifyAndParse_expiredToken_throws() {
		Clock clock = Clock.fixed(Instant.parse("2026-02-05T00:00:00Z"), ZoneOffset.UTC);
		JwtService jwtService = new JwtService(new ObjectMapper(), clock, SECRET);

		String token = jwtService.mintForTests("usr_1", "admin", clock.instant().minusSeconds(1));

		assertThatThrownBy(() -> jwtService.verifyAndParse(token))
			.isInstanceOf(JwtValidationException.class);
	}

	@Test
	void verifyAndParse_tamperedSignature_throws() {
		Clock clock = Clock.fixed(Instant.parse("2026-02-05T00:00:00Z"), ZoneOffset.UTC);
		JwtService jwtService = new JwtService(new ObjectMapper(), clock, SECRET);

		String token = jwtService.mintForTests("usr_1", "admin", clock.instant().plusSeconds(3600));
		String tampered = token.substring(0, token.length() - 2) + "aa";

		assertThatThrownBy(() -> jwtService.verifyAndParse(tampered))
			.isInstanceOf(JwtValidationException.class);
	}

	@Test
	void verifyAndParse_invalidTokenFormat_throws() {
		Clock clock = Clock.fixed(Instant.parse("2026-02-05T00:00:00Z"), ZoneOffset.UTC);
		JwtService jwtService = new JwtService(new ObjectMapper(), clock, SECRET);

		assertThatThrownBy(() -> jwtService.verifyAndParse("not-a-jwt"))
			.isInstanceOf(JwtValidationException.class)
			.hasMessage("invalid_token_format");
	}

	@Test
	void verifyAndParse_unsupportedAlg_throws() throws Exception {
		Clock clock = Clock.fixed(Instant.parse("2026-02-05T00:00:00Z"), ZoneOffset.UTC);
		ObjectMapper mapper = new ObjectMapper();
		JwtService jwtService = new JwtService(mapper, clock, SECRET);

		String token = mintToken(
			mapper,
			SECRET,
			Map.of("alg", "HS384", "typ", "JWT"),
			Map.of("sub", "usr_1", "role", "admin", "exp", clock.instant().plusSeconds(3600).getEpochSecond())
		);

		assertThatThrownBy(() -> jwtService.verifyAndParse(token))
			.isInstanceOf(JwtValidationException.class)
			.hasMessage("unsupported_alg");
	}

	@Test
	void verifyAndParse_invalidBase64_throws() {
		Clock clock = Clock.fixed(Instant.parse("2026-02-05T00:00:00Z"), ZoneOffset.UTC);
		JwtService jwtService = new JwtService(new ObjectMapper(), clock, SECRET);

		assertThatThrownBy(() -> jwtService.verifyAndParse("%%%.aaa.bbb"))
			.isInstanceOf(JwtValidationException.class)
			.hasMessage("invalid_base64");
	}

	@Test
	void verifyAndParse_invalidJson_throws() {
		Clock clock = Clock.fixed(Instant.parse("2026-02-05T00:00:00Z"), ZoneOffset.UTC);
		JwtService jwtService = new JwtService(new ObjectMapper(), clock, SECRET);

		String badHeader = base64Url("not json");
		String payload = base64Url("{\"sub\":\"usr_1\",\"role\":\"admin\"}");

		assertThatThrownBy(() -> jwtService.verifyAndParse(badHeader + "." + payload + ".AA"))
			.isInstanceOf(JwtValidationException.class)
			.hasMessage("invalid_json");
	}

	@Test
	void verifyAndParse_missingRequiredClaims_throws() throws Exception {
		Clock clock = Clock.fixed(Instant.parse("2026-02-05T00:00:00Z"), ZoneOffset.UTC);
		ObjectMapper mapper = new ObjectMapper();
		JwtService jwtService = new JwtService(mapper, clock, SECRET);

		Map<String, Object> claims = new LinkedHashMap<>();
		claims.put("sub", "usr_1");
		claims.put("exp", clock.instant().plusSeconds(3600).getEpochSecond());
		String token = mintToken(mapper, SECRET, Map.of("alg", "HS256", "typ", "JWT"), claims);

		assertThatThrownBy(() -> jwtService.verifyAndParse(token))
			.isInstanceOf(JwtValidationException.class)
			.hasMessage("missing_required_claims");
	}

	@Test
	void verifyAndParse_invalidRole_throws() throws Exception {
		Clock clock = Clock.fixed(Instant.parse("2026-02-05T00:00:00Z"), ZoneOffset.UTC);
		ObjectMapper mapper = new ObjectMapper();
		JwtService jwtService = new JwtService(mapper, clock, SECRET);

		String token = mintToken(
			mapper,
			SECRET,
			Map.of("alg", "HS256", "typ", "JWT"),
			Map.of("sub", "usr_1", "role", "user", "exp", clock.instant().plusSeconds(3600).getEpochSecond())
		);

		assertThatThrownBy(() -> jwtService.verifyAndParse(token))
			.isInstanceOf(JwtValidationException.class)
			.hasMessage("invalid_role");
	}

	@Test
	void verifyAndParse_missingExpClaim_isAllowed() throws Exception {
		Clock clock = Clock.fixed(Instant.parse("2026-02-05T00:00:00Z"), ZoneOffset.UTC);
		ObjectMapper mapper = new ObjectMapper();
		JwtService jwtService = new JwtService(mapper, clock, SECRET);

		String token = mintToken(mapper, SECRET, Map.of("alg", "HS256", "typ", "JWT"), Map.of("sub", "usr_1", "role", "agent"));

		AuthenticatedUser user = jwtService.verifyAndParse(token);
		assertThat(user.userId()).isEqualTo("usr_1");
		assertThat(user.role()).isEqualTo("agent");
	}

	@Test
	void verifyAndParse_expAsString_isAccepted() throws Exception {
		Clock clock = Clock.fixed(Instant.parse("2026-02-05T00:00:00Z"), ZoneOffset.UTC);
		ObjectMapper mapper = new ObjectMapper();
		JwtService jwtService = new JwtService(mapper, clock, SECRET);

		String token = mintToken(
			mapper,
			SECRET,
			Map.of("alg", "HS256", "typ", "JWT"),
			Map.of("sub", "usr_1", "role", "admin", "exp", String.valueOf(clock.instant().plusSeconds(3600).getEpochSecond()))
		);

		AuthenticatedUser user = jwtService.verifyAndParse(token);
		assertThat(user.role()).isEqualTo("admin");
	}

	@Test
	void verifyAndParse_expWithWrongType_throws() throws Exception {
		Clock clock = Clock.fixed(Instant.parse("2026-02-05T00:00:00Z"), ZoneOffset.UTC);
		ObjectMapper mapper = new ObjectMapper();
		JwtService jwtService = new JwtService(mapper, clock, SECRET);

		String token = mintToken(
			mapper,
			SECRET,
			Map.of("alg", "HS256", "typ", "JWT"),
			Map.of("sub", "usr_1", "role", "admin", "exp", true)
		);

		assertThatThrownBy(() -> jwtService.verifyAndParse(token))
			.isInstanceOf(JwtValidationException.class)
			.hasMessage("invalid_number_claim");
	}
}
