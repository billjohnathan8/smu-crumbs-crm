package com.scroogebank.crm.transaction_service.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import tools.jackson.databind.ObjectMapper;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPublicKey;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
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
	void verifyAndParse_superAdminRole_isNormalizedToAdmin() {
		String token = signedToken(Map.of(
			"sub", "usr_1",
			"role", "super_admin",
			"iat", FIXED_CLOCK.instant().getEpochSecond(),
			"exp", FIXED_CLOCK.instant().plusSeconds(3600).getEpochSecond()
		));

		AuthenticatedUser user = jwtService.verifyAndParse(token);
		assertEquals("admin", user.role());
	}

	@Test
	void verifyAndParse_agentRole_isNormalizedToUser() {
		String token = signedToken(Map.of(
			"sub", "usr_1",
			"role", "agent",
			"iat", FIXED_CLOCK.instant().getEpochSecond(),
			"exp", FIXED_CLOCK.instant().plusSeconds(3600).getEpochSecond()
		));

		AuthenticatedUser user = jwtService.verifyAndParse(token);
		assertEquals("user", user.role());
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
	void verifyAndParse_withoutExp_throws() {
		String token = signedToken(Map.of(
			"sub", "usr_1",
			"role", "user",
			"iat", FIXED_CLOCK.instant().getEpochSecond()
		));

		assertThrows(JwtValidationException.class, () -> jwtService.verifyAndParse(token));
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

	@Test
	void constructor_hybridModeRejectedWhenDisabled() {
		assertThrows(
			IllegalStateException.class,
			() -> new JwtService(
				new ObjectMapper(),
				FIXED_CLOCK,
				SECRET,
				"hybrid",
				false,
				"",
				"",
				"",
				300,
				HttpClient.newHttpClient()
			)
		);
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

	// --- RS256 / Cognito path ---

	private static final KeyPair RSA_KEY_PAIR;
	static {
		try {
			KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
			gen.initialize(2048);
			RSA_KEY_PAIR = gen.generateKeyPair();
		} catch (Exception e) {
			throw new RuntimeException(e);
		}
	}

	private static final String COGNITO_ISSUER = "https://cognito-idp.us-east-1.amazonaws.com/test-pool";
	private static final String COGNITO_AUDIENCE = "test-client-id";
	private static final String COGNITO_JWKS_URL = "https://cognito-idp.us-east-1.amazonaws.com/test-pool/.well-known/jwks.json";
	private static final String KID = "test-kid-1";

	private JwtService cognitoService(HttpClient client) {
		return new JwtService(objectMapper, FIXED_CLOCK, SECRET, "cognito", true,
			COGNITO_ISSUER, COGNITO_AUDIENCE, COGNITO_JWKS_URL, 300, client);
	}

	private JwtService hybridService(HttpClient client) {
		return new JwtService(objectMapper, FIXED_CLOCK, SECRET, "hybrid", true,
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
			String h = b64Json(header);
			String p = b64Json(claims);
			String signingInput = h + "." + p;
			java.security.Signature sig = java.security.Signature.getInstance("SHA256withRSA");
			sig.initSign(RSA_KEY_PAIR.getPrivate());
			sig.update(signingInput.getBytes(StandardCharsets.US_ASCII));
			return signingInput + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(sig.sign());
		} catch (Exception ex) {
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
		assertEquals("usr_1", user.userId());
		assertEquals("admin", user.role());
	}

	@Test
	void cognitoToken_withUserGroup() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("user")));
		assertEquals("user", svc.verifyAndParse(token).role());
	}

	@Test
	void cognitoToken_withAgentGroup_mapsToUser() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("agent")));
		assertEquals("user", svc.verifyAndParse(token).role());
	}

	@Test
	void cognitoToken_superAdminMapsToAdmin() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("super_admin")));
		assertEquals("admin", svc.verifyAndParse(token).role());
	}

	@Test
	void cognitoToken_adminTakesPriorityOverUser() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("user", "admin")));
		assertEquals("admin", svc.verifyAndParse(token).role());
	}

	@Test
	void cognitoToken_groupsAsString() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", "admin, user"));
		assertEquals("admin", svc.verifyAndParse(token).role());
	}

	@Test
	void cognitoToken_customRole() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		String token = rsaSignedToken(cognitoClaims("custom:role", "user"));
		assertEquals("user", svc.verifyAndParse(token).role());
	}

	@Test
	void cognitoToken_roleClaim() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		String token = rsaSignedToken(cognitoClaims("role", "admin"));
		assertEquals("admin", svc.verifyAndParse(token).role());
	}

	@Test
	void cognitoToken_missingSub_throws() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		HashMap<String, Object> claims = cognitoClaims("cognito:groups", List.of("admin"));
		claims.remove("sub");
		String token = rsaSignedToken(claims);
		assertThrows(JwtValidationException.class, () -> svc.verifyAndParse(token));
	}

	@Test
	void cognitoToken_noRoleAnywhere_throws() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		String token = rsaSignedToken(cognitoClaims());
		assertThrows(JwtValidationException.class, () -> svc.verifyAndParse(token));
	}

	@Test
	void cognitoToken_missingKid_throws() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		String token = rsaSignedToken(new HashMap<>(Map.of("alg", "RS256", "typ", "JWT")),
			cognitoClaims("cognito:groups", List.of("admin")));
		assertThrows(JwtValidationException.class, () -> svc.verifyAndParse(token));
	}

	@Test
	void cognitoToken_unknownKid_throws() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson("other-kid")));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("admin")));
		assertThrows(JwtValidationException.class, () -> svc.verifyAndParse(token));
	}

	@Test
	void cognitoToken_invalidSignature_throws() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("admin")));
		String tampered = token.substring(0, token.lastIndexOf('.') + 1) + "AAAA";
		assertThrows(JwtValidationException.class, () -> svc.verifyAndParse(tampered));
	}

	@Test
	void cognitoToken_wrongIssuer_throws() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		HashMap<String, Object> claims = cognitoClaims("cognito:groups", List.of("admin"));
		claims.put("iss", "https://wrong.example.com");
		String token = rsaSignedToken(claims);
		assertThrows(JwtValidationException.class, () -> svc.verifyAndParse(token));
	}

	@Test
	void cognitoToken_invalidAudience_throws() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		HashMap<String, Object> claims = cognitoClaims("cognito:groups", List.of("admin"));
		claims.put("aud", "wrong-audience");
		claims.remove("client_id");
		String token = rsaSignedToken(claims);
		assertThrows(JwtValidationException.class, () -> svc.verifyAndParse(token));
	}

	@Test
	void cognitoToken_audienceAsList() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		HashMap<String, Object> claims = cognitoClaims("cognito:groups", List.of("admin"));
		claims.put("aud", List.of("other-app", COGNITO_AUDIENCE));
		String token = rsaSignedToken(claims);
		assertEquals("admin", svc.verifyAndParse(token).role());
	}

	@Test
	void cognitoToken_audienceViaClientId() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		HashMap<String, Object> claims = cognitoClaims("cognito:groups", List.of("admin"));
		claims.remove("aud");
		claims.put("client_id", COGNITO_AUDIENCE);
		String token = rsaSignedToken(claims);
		assertEquals("admin", svc.verifyAndParse(token).role());
	}

	@Test
	void cognitoToken_blankAudience_throws() throws Exception {
		JwtService svc = new JwtService(objectMapper, FIXED_CLOCK, SECRET, "cognito", true,
			COGNITO_ISSUER, "", COGNITO_JWKS_URL, 300, mockJwksClient(buildJwksJson(KID)));
		HashMap<String, Object> claims = cognitoClaims("cognito:groups", List.of("admin"));
		claims.remove("aud");
		String token = rsaSignedToken(claims);
		assertThrows(JwtValidationException.class, () -> svc.verifyAndParse(token));
	}

	@Test
	void cognitoToken_expired_throws() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		HashMap<String, Object> claims = cognitoClaims("cognito:groups", List.of("admin"));
		claims.put("exp", FIXED_CLOCK.instant().minusSeconds(1).getEpochSecond());
		String token = rsaSignedToken(claims);
		assertThrows(JwtValidationException.class, () -> svc.verifyAndParse(token));
	}

	@Test
	void cognitoToken_issuerNotConfigured_throws() throws Exception {
		JwtService svc = new JwtService(objectMapper, FIXED_CLOCK, SECRET, "cognito", true,
			"", COGNITO_AUDIENCE, COGNITO_JWKS_URL, 300, mockJwksClient(buildJwksJson(KID)));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("admin")));
		assertThrows(JwtValidationException.class, () -> svc.verifyAndParse(token));
	}

	@Test
	void rs256_rejectedInLocalMode() {
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("admin")));
		assertThrows(JwtValidationException.class, () -> jwtService.verifyAndParse(token));
	}

	@Test
	void hs256_rejectedInCognitoMode() throws Exception {
		JwtService svc = cognitoService(mockJwksClient(buildJwksJson(KID)));
		String token = jwtService.mintAccessToken("usr_1", "admin", FIXED_CLOCK.instant().plusSeconds(3600));
		assertThrows(JwtValidationException.class, () -> svc.verifyAndParse(token));
	}

	@Test
	void hybridMode_acceptsBothAlgorithms() throws Exception {
		JwtService svc = hybridService(mockJwksClient(buildJwksJson(KID)));
		String hs = svc.mintAccessToken("usr_1", "admin", FIXED_CLOCK.instant().plusSeconds(3600));
		assertEquals("usr_1", svc.verifyAndParse(hs).userId());
		String rs = rsaSignedToken(cognitoClaims("cognito:groups", List.of("user")));
		assertEquals("user", svc.verifyAndParse(rs).role());
	}

	@Test
	void loadJwks_emptyUrl_throws() {
		JwtService svc = new JwtService(objectMapper, FIXED_CLOCK, SECRET, "cognito", true,
			COGNITO_ISSUER, COGNITO_AUDIENCE, "", 300, mock(HttpClient.class));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("admin")));
		assertThrows(JwtValidationException.class, () -> svc.verifyAndParse(token));
	}

	@Test
	void loadJwks_non200_throws() throws Exception {
		JwtService svc = cognitoService(mockJwksClientError(500));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("admin")));
		assertThrows(JwtValidationException.class, () -> svc.verifyAndParse(token));
	}

	@Test
	void loadJwks_emptyKeys_throws() throws Exception {
		JwtService svc = cognitoService(mockJwksClient("{\"keys\":[]}"));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("admin")));
		assertThrows(JwtValidationException.class, () -> svc.verifyAndParse(token));
	}

	@Test
	void loadJwks_invalidFormat_throws() throws Exception {
		JwtService svc = cognitoService(mockJwksClient("{\"keys\":\"not-an-array\"}"));
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("admin")));
		assertThrows(JwtValidationException.class, () -> svc.verifyAndParse(token));
	}

	@SuppressWarnings("unchecked")
	@Test
	void loadJwks_ioException_throws() throws Exception {
		HttpClient client = mock(HttpClient.class);
		when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
			.thenThrow(new java.io.IOException("connection refused"));
		JwtService svc = cognitoService(client);
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("admin")));
		assertThrows(JwtValidationException.class, () -> svc.verifyAndParse(token));
	}

	@SuppressWarnings("unchecked")
	@Test
	void loadJwks_interrupted_throws() throws Exception {
		HttpClient client = mock(HttpClient.class);
		when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
			.thenThrow(new InterruptedException("interrupted"));
		JwtService svc = cognitoService(client);
		String token = rsaSignedToken(cognitoClaims("cognito:groups", List.of("admin")));
		assertThrows(JwtValidationException.class, () -> svc.verifyAndParse(token));
	}

	@Test
	void constructor_invalidAuthMode_throws() {
		assertThrows(IllegalArgumentException.class, () -> new JwtService(
			objectMapper, FIXED_CLOCK, SECRET, "oauth2", true,
			"", "", "", 300, HttpClient.newHttpClient()));
	}
}
