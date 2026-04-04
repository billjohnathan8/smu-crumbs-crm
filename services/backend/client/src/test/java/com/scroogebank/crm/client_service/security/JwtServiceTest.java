package com.scroogebank.crm.client_service.security;

import tools.jackson.databind.ObjectMapper;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.security.SignatureException;
import java.security.interfaces.RSAPublicKey;
import java.security.InvalidKeyException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link JwtService} token validation and parsing.
 */
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
			Map.of("sub", "usr_1", "role", "unknown", "exp", clock.instant().plusSeconds(3600).getEpochSecond())
		);

		assertThatThrownBy(() -> jwtService.verifyAndParse(token))
			.isInstanceOf(JwtValidationException.class)
			.hasMessage("invalid_role");
	}

	@Test
	void verifyAndParse_superAdminRole_isNormalizedToAdmin() throws Exception {
		Clock clock = Clock.fixed(Instant.parse("2026-02-05T00:00:00Z"), ZoneOffset.UTC);
		ObjectMapper mapper = new ObjectMapper();
		JwtService jwtService = new JwtService(mapper, clock, SECRET);

		String token = mintToken(
			mapper,
			SECRET,
			Map.of("alg", "HS256", "typ", "JWT"),
			Map.of("sub", "usr_1", "role", "super_admin", "exp", clock.instant().plusSeconds(3600).getEpochSecond())
		);

		AuthenticatedUser user = jwtService.verifyAndParse(token);
		assertThat(user.role()).isEqualTo("admin");
	}

	@Test
	void verifyAndParse_agentRole_isNormalizedToUser() throws Exception {
		Clock clock = Clock.fixed(Instant.parse("2026-02-05T00:00:00Z"), ZoneOffset.UTC);
		ObjectMapper mapper = new ObjectMapper();
		JwtService jwtService = new JwtService(mapper, clock, SECRET);

		String token = mintToken(
			mapper,
			SECRET,
			Map.of("alg", "HS256", "typ", "JWT"),
			Map.of("sub", "usr_1", "role", "agent", "exp", clock.instant().plusSeconds(3600).getEpochSecond())
		);

		AuthenticatedUser user = jwtService.verifyAndParse(token);
		assertThat(user.role()).isEqualTo("user");
	}

	@Test
	void verifyAndParse_missingExpClaim_throws() throws Exception {
		Clock clock = Clock.fixed(Instant.parse("2026-02-05T00:00:00Z"), ZoneOffset.UTC);
		ObjectMapper mapper = new ObjectMapper();
		JwtService jwtService = new JwtService(mapper, clock, SECRET);

		String token = mintToken(mapper, SECRET, Map.of("alg", "HS256", "typ", "JWT"), Map.of("sub", "usr_1", "role", "user"));

		assertThatThrownBy(() -> jwtService.verifyAndParse(token))
			.isInstanceOf(JwtValidationException.class);
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

	@Test
	void constructor_hybridModeRejectedWhenDisabled() {
		Clock clock = Clock.fixed(Instant.parse("2026-02-05T00:00:00Z"), ZoneOffset.UTC);
		assertThatThrownBy(() -> new JwtService(
			new ObjectMapper(),
			clock,
			SECRET,
			"hybrid",
			false,
			"",
			"",
			"",
			300,
			HttpClient.newHttpClient()
		))
			.isInstanceOf(IllegalStateException.class)
			.hasMessage("hybrid_auth_mode_not_allowed");
	}

	// --- RS256 / Cognito path ---

	private static final KeyPair RSA_KEY_PAIR;
	private static final ObjectMapper MAPPER = new ObjectMapper();
	static {
		try {
			KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
			gen.initialize(2048);
			RSA_KEY_PAIR = gen.generateKeyPair();
		} catch (NoSuchAlgorithmException e) {
			throw new RuntimeException(e);
		}
	}

	private static final Clock FIXED_CLOCK = Clock.fixed(Instant.parse("2026-02-05T00:00:00Z"), ZoneOffset.UTC);
	private static final String COGNITO_ISSUER = "https://cognito-idp.us-east-1.amazonaws.com/test-pool";
	private static final String COGNITO_AUDIENCE = "test-client-id";
	private static final String COGNITO_JWKS_URL = "https://cognito-idp.us-east-1.amazonaws.com/test-pool/.well-known/jwks.json";
	private static final String KID = "test-kid-1";

	private JwtService cognitoService(HttpClient client) {
		return new JwtService(MAPPER, FIXED_CLOCK, SECRET, "cognito", true,
			COGNITO_ISSUER, COGNITO_AUDIENCE, COGNITO_JWKS_URL, 300, client);
	}

	private JwtService hybridService(HttpClient client) {
		return new JwtService(MAPPER, FIXED_CLOCK, SECRET, "hybrid", true,
			COGNITO_ISSUER, COGNITO_AUDIENCE, COGNITO_JWKS_URL, 300, client);
	}

	@SuppressWarnings("unchecked")
	private HttpClient mockJwksClient(String jwksJson) throws Exception {
		HttpClient client = mock(HttpClient.class);
		HttpResponse<String> resp = mock(HttpResponse.class);
		when(resp.statusCode()).thenReturn(200);
		when(resp.body()).thenReturn(jwksJson);
		when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(resp);
		return client;
	}

	@SuppressWarnings("unchecked")
	private HttpClient mockJwksClientError(int statusCode) throws Exception {
		HttpClient client = mock(HttpClient.class);
		HttpResponse<String> resp = mock(HttpResponse.class);
		when(resp.statusCode()).thenReturn(statusCode);
		when(resp.body()).thenReturn("");
		when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(resp);
		return client;
	}

	private String buildJwksJson(String kid) {
		RSAPublicKey pub = (RSAPublicKey) RSA_KEY_PAIR.getPublic();
		String n = Base64.getUrlEncoder().withoutPadding().encodeToString(toUnsigned(pub.getModulus()));
		String e = Base64.getUrlEncoder().withoutPadding().encodeToString(toUnsigned(pub.getPublicExponent()));
		return "{\"keys\":[{\"kty\":\"RSA\",\"kid\":\"" + kid + "\",\"n\":\"" + n + "\",\"e\":\"" + e + "\"}]}";
	}

	private static byte[] toUnsigned(java.math.BigInteger bi) {
		byte[] bytes = bi.toByteArray();
		if (bytes.length > 1 && bytes[0] == 0) {
			return java.util.Arrays.copyOfRange(bytes, 1, bytes.length);
		}
		return bytes;
	}

	private String rsaSignedToken(Map<String, Object> claims) {
		return rsaSignedToken(new HashMap<>(Map.of("alg", "RS256", "typ", "JWT", "kid", KID)), claims);
	}

	private String rsaSignedToken(Map<String, Object> header, Map<String, Object> claims) {
		try {
			String h = Base64.getUrlEncoder().withoutPadding().encodeToString(
				MAPPER.writeValueAsString(header).getBytes(StandardCharsets.UTF_8));
			String p = Base64.getUrlEncoder().withoutPadding().encodeToString(
				MAPPER.writeValueAsString(claims).getBytes(StandardCharsets.UTF_8));
			String signingInput = h + "." + p;
			java.security.Signature sig = java.security.Signature.getInstance("SHA256withRSA");
			sig.initSign(RSA_KEY_PAIR.getPrivate());
			sig.update(signingInput.getBytes(StandardCharsets.US_ASCII));
			return signingInput + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(sig.sign());
		} catch (RuntimeException | NoSuchAlgorithmException | InvalidKeyException | SignatureException ex) {
			throw new IllegalStateException(ex);
		}
	}

	private HashMap<String, Object> cognitoClaims(Object... extra) {
		HashMap<String, Object> claims = new HashMap<>();
		claims.put("sub", "usr_1");
		claims.put("iss", COGNITO_ISSUER);
		claims.put("aud", COGNITO_AUDIENCE);
		claims.put("exp", FIXED_CLOCK.instant().plusSeconds(3600).getEpochSecond());
		for (int i = 0; i < extra.length; i += 2) {
			claims.put((String) extra[i], extra[i + 1]);
		}
		return claims;
	}

	@Test
	void cognitoToken_withAdminGroup_returnsAdmin() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("admin")));
		AuthenticatedUser user = svc.verifyAndParse(token);
		assertThat(user.userId()).isEqualTo("usr_1");
		assertThat(user.role()).isEqualTo("admin");
	}

	@Test
	void cognitoToken_withUserGroup() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("user")));
		assertThat(svc.verifyAndParse(token).role()).isEqualTo("user");
	}

	@Test
	void cognitoToken_withAgentGroup_mapsToUser() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("agent")));
		assertThat(svc.verifyAndParse(token).role()).isEqualTo("user");
	}

	@Test
	void cognitoToken_superAdminMapsToAdmin() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("super_admin")));
		assertThat(svc.verifyAndParse(token).role()).isEqualTo("admin");
	}

	@Test
	void cognitoToken_adminTakesPriorityOverUser() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("user", "admin")));
		assertThat(svc.verifyAndParse(token).role()).isEqualTo("admin");
	}

	@Test
	void cognitoToken_groupsAsString() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", "admin, user"));
		assertThat(svc.verifyAndParse(token).role()).isEqualTo("admin");
	}

	@Test
	void cognitoToken_customRole() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		String token = rsaSignedToken(cognitoClaims("custom:role", "user"));
		assertThat(svc.verifyAndParse(token).role()).isEqualTo("user");
	}

	@Test
	void cognitoToken_roleClaim() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		String token = rsaSignedToken(cognitoClaims("role", "admin"));
		assertThat(svc.verifyAndParse(token).role()).isEqualTo("admin");
	}

	@Test
	void cognitoToken_missingSub_throws() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		HashMap<String, Object> claims = cognitoClaims("cognito:groups", List.of("admin"));
		claims.remove("sub");
		String token = rsaSignedToken(claims);
		assertThatThrownBy(() -> svc.verifyAndParse(token)).isInstanceOf(JwtValidationException.class);
	}

	@Test
	void cognitoToken_noRoleAnywhere_throws() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		String token = rsaSignedToken(cognitoClaims());
		assertThatThrownBy(() -> svc.verifyAndParse(token)).isInstanceOf(JwtValidationException.class);
	}

	@Test
	void cognitoToken_missingKid_throws() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		String token = rsaSignedToken(new HashMap<>(Map.of("alg", "RS256", "typ", "JWT")),
			cognitoClaims("cognito:groups", List.of("admin")));
		assertThatThrownBy(() -> svc.verifyAndParse(token)).isInstanceOf(JwtValidationException.class);
	}

	@Test
	void cognitoToken_unknownKid_throws() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson("other-kid")));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("admin")));
		assertThatThrownBy(() -> svc.verifyAndParse(token)).isInstanceOf(JwtValidationException.class);
	}

	@Test
	void cognitoToken_invalidSignature_throws() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("admin")));
		String tampered = token.substring(0, token.lastIndexOf('.') + 1) + "AAAA";
		assertThatThrownBy(() -> svc.verifyAndParse(tampered)).isInstanceOf(JwtValidationException.class);
	}

	@Test
	void cognitoToken_wrongIssuer_throws() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		HashMap<String, Object> claims = cognitoClaims("cognito:groups", List.of("admin"));
		claims.put("iss", "https://wrong.example.com");
		String token = rsaSignedToken(claims);
		assertThatThrownBy(() -> svc.verifyAndParse(token)).isInstanceOf(JwtValidationException.class);
	}

	@Test
	void cognitoToken_invalidAudience_throws() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		HashMap<String, Object> claims = cognitoClaims("cognito:groups", List.of("admin"));
		claims.put("aud", "wrong-audience");
		claims.remove("client_id");
		String token = rsaSignedToken(claims);
		assertThatThrownBy(() -> svc.verifyAndParse(token)).isInstanceOf(JwtValidationException.class);
	}

	@Test
	void cognitoToken_audienceAsList() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		HashMap<String, Object> claims = cognitoClaims("cognito:groups", List.of("admin"));
		claims.put("aud", List.of("other-app", COGNITO_AUDIENCE));
		String token = rsaSignedToken(claims);
		assertThat(svc.verifyAndParse(token).role()).isEqualTo("admin");
	}

	@Test
	void cognitoToken_audienceViaClientId() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		HashMap<String, Object> claims = cognitoClaims("cognito:groups", List.of("admin"));
		claims.remove("aud");
		claims.put("client_id", COGNITO_AUDIENCE);
		String token = rsaSignedToken(claims);
		assertThat(svc.verifyAndParse(token).role()).isEqualTo("admin");
	}

	@Test
	void cognitoToken_blankAudience_throws() throws Exception {
		JwtService svc = new JwtService(MAPPER, FIXED_CLOCK, SECRET, "cognito", true,
			COGNITO_ISSUER, "", COGNITO_JWKS_URL, 300, mockJwksClient(buildJwksJson(KID)));
		HashMap<String, Object> claims = cognitoClaims("cognito:groups", List.of("admin"));
		claims.remove("aud");
		String token = rsaSignedToken(claims);
		assertThatThrownBy(() -> svc.verifyAndParse(token))
			.isInstanceOf(JwtValidationException.class);
	}

	@Test
	void cognitoToken_expired_throws() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		HashMap<String, Object> claims = cognitoClaims("cognito:groups", List.of("admin"));
		claims.put("exp", FIXED_CLOCK.instant().minusSeconds(1).getEpochSecond());
		String token = rsaSignedToken(claims);
		assertThatThrownBy(() -> svc.verifyAndParse(token)).isInstanceOf(JwtValidationException.class);
	}

	@Test
	void cognitoToken_issuerNotConfigured_throws() throws Exception {
		JwtService svc = new JwtService(MAPPER, FIXED_CLOCK, SECRET, "cognito", true,
			"", COGNITO_AUDIENCE, COGNITO_JWKS_URL, 300, mockJwksClient(buildJwksJson(KID)));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("admin")));
		assertThatThrownBy(() -> svc.verifyAndParse(token)).isInstanceOf(JwtValidationException.class);
	}

	@Test
	void rs256_rejectedInLocalMode() {
		JwtService svc = new JwtService(MAPPER, FIXED_CLOCK, SECRET);
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("admin")));
		assertThatThrownBy(() -> svc.verifyAndParse(token)).isInstanceOf(JwtValidationException.class);
	}

	@Test
	void hs256_rejectedInCognitoMode() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		JwtService localSvc = new JwtService(MAPPER, FIXED_CLOCK, SECRET);
		String token = localSvc.mintForTests("usr_1", "admin", FIXED_CLOCK.instant().plusSeconds(3600));
		assertThatThrownBy(() -> svc.verifyAndParse(token)).isInstanceOf(JwtValidationException.class);
	}

	@Test
	void hybridMode_acceptsBothAlgorithms() throws Exception {
		JwtService svc = hybridService(mockJwksClient(buildJwksJson(KID)));
		String hs = svc.mintForTests("usr_1", "admin", FIXED_CLOCK.instant().plusSeconds(3600));
		assertThat(svc.verifyAndParse(hs).userId()).isEqualTo("usr_1");
		String rs = rsaSignedToken(cognitoClaims("cognito:groups", List.of("user")));
		assertThat(svc.verifyAndParse(rs).role()).isEqualTo("user");
	}

	@Test
	void loadJwks_emptyUrl_throws() {
		JwtService svc = new JwtService(MAPPER, FIXED_CLOCK, SECRET, "cognito", true,
			COGNITO_ISSUER, COGNITO_AUDIENCE, "", 300, mock(HttpClient.class));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("admin")));
		assertThatThrownBy(() -> svc.verifyAndParse(token)).isInstanceOf(JwtValidationException.class);
	}

	@Test
	void loadJwks_non200_throws() throws Exception {
		JwtService svc = cognitoService(mockJwksClientError(500));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("admin")));
		assertThatThrownBy(() -> svc.verifyAndParse(token)).isInstanceOf(JwtValidationException.class);
	}

	@Test
	void loadJwks_emptyKeys_throws() throws Exception {
		JwtService svc = cognitoService(mockJwksClient("{\"keys\":[]}"));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("admin")));
		assertThatThrownBy(() -> svc.verifyAndParse(token)).isInstanceOf(JwtValidationException.class);
	}

	@Test
	void loadJwks_invalidFormat_throws() throws Exception {
		JwtService svc = cognitoService(mockJwksClient("{\"keys\":\"not-an-array\"}"));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("admin")));
		assertThatThrownBy(() -> svc.verifyAndParse(token)).isInstanceOf(JwtValidationException.class);
	}

	@SuppressWarnings("unchecked")
	@Test
	void loadJwks_ioException_throws() throws Exception {
		HttpClient client = mock(HttpClient.class);
		when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
			.thenThrow(new java.io.IOException("connection refused"));
		JwtService svc = cognitoService(client);
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("admin")));
		assertThatThrownBy(() -> svc.verifyAndParse(token)).isInstanceOf(JwtValidationException.class);
	}

	@SuppressWarnings("unchecked")
	@Test
	void loadJwks_interrupted_throws() throws Exception {
		HttpClient client = mock(HttpClient.class);
		when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
			.thenThrow(new InterruptedException("interrupted"));
		JwtService svc = cognitoService(client);
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("admin")));
		assertThatThrownBy(() -> svc.verifyAndParse(token)).isInstanceOf(JwtValidationException.class);
	}

	@Test
	void constructor_invalidAuthMode_throws() {
		assertThatThrownBy(() -> new JwtService(
			MAPPER, FIXED_CLOCK, SECRET, "oauth2", true,
			"", "", "", 300, HttpClient.newHttpClient()))
			.isInstanceOf(IllegalArgumentException.class);
	}
}
