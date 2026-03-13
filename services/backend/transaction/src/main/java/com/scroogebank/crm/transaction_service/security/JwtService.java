package com.scroogebank.crm.transaction_service.security;

import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.Signature;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.RSAPublicKeySpec;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/**
 * Issues and validates HMAC-SHA256 JWTs for access tokens.
 */
@Component
public class JwtService {
	private static final Base64.Decoder BASE64_URL_DECODER = Base64.getUrlDecoder();
	private static final Base64.Encoder BASE64_URL_ENCODER = Base64.getUrlEncoder().withoutPadding();
	private static final Duration HTTP_TIMEOUT = Duration.ofSeconds(5);
	private static final Duration HTTP_CONNECT_TIMEOUT = Duration.ofSeconds(3);

	private final ObjectMapper objectMapper;
	private final Clock clock;
	private final byte[] secret;
	private final AuthMode authMode;
	private final String cognitoIssuer;
	private final String cognitoAudience;
	private final String cognitoJwksUrl;
	private final Duration jwksCacheTtl;
	private final HttpClient httpClient;
	private volatile CachedJwks jwksCache;

	@Autowired
	public JwtService(
		ObjectMapper objectMapper,
		Clock clock,
		@Value("${app.jwt.hmac-secret}") String hmacSecret,
		@Value("${app.jwt.auth-mode:hybrid}") String authMode,
		@Value("${app.jwt.cognito.issuer:}") String cognitoIssuer,
		@Value("${app.jwt.cognito.audience:}") String cognitoAudience,
		@Value("${app.jwt.cognito.jwks-url:}") String cognitoJwksUrl,
		@Value("${app.jwt.cognito.jwks-cache-ttl-seconds:300}") long jwksCacheTtlSeconds
	) {
		this(
			objectMapper,
			clock,
			hmacSecret,
			authMode,
			cognitoIssuer,
			cognitoAudience,
			cognitoJwksUrl,
			jwksCacheTtlSeconds,
			HttpClient.newBuilder().connectTimeout(HTTP_CONNECT_TIMEOUT).build()
		);
	}

	private JwtService(
		ObjectMapper objectMapper,
		Clock clock,
		String hmacSecret,
		String authMode,
		String cognitoIssuer,
		String cognitoAudience,
		String cognitoJwksUrl,
		long jwksCacheTtlSeconds,
		HttpClient httpClient
	) {
		this.objectMapper = objectMapper;
		this.clock = clock;
		this.secret = trim(hmacSecret).getBytes(StandardCharsets.UTF_8);
		this.authMode = parseAuthMode(authMode);
		this.cognitoIssuer = trim(cognitoIssuer);
		this.cognitoAudience = trim(cognitoAudience);
		this.cognitoJwksUrl = trim(cognitoJwksUrl);
		this.jwksCacheTtl = Duration.ofSeconds(Math.max(jwksCacheTtlSeconds, 60));
		this.httpClient = httpClient;
	}

	JwtService(ObjectMapper objectMapper, Clock clock, String hmacSecret) {
		this(
			objectMapper,
			clock,
			hmacSecret,
			"local",
			"",
			"",
			"",
			300,
			HttpClient.newBuilder().connectTimeout(HTTP_CONNECT_TIMEOUT).build()
		);
	}

	/**
	 * Verifies a bearer token signature and required claims, returning the user.
	 */
	public AuthenticatedUser verifyAndParse(String token) {
		String[] parts = token.split("\\.");
		if (parts.length != 3) {
			throw new JwtValidationException("invalid_token_format");
		}

		byte[] headerBytes = base64UrlDecode(parts[0]);
		Map<String, Object> header = readJson(headerBytes);
		String alg = asString(header.get("alg"));
		Map<String, Object> claims = readJson(base64UrlDecode(parts[1]));

		switch (alg) {
			case "HS256" -> {
				if (authMode == AuthMode.COGNITO) {
					throw new JwtValidationException("token_alg_not_allowed");
				}
				verifyHs256Signature(parts);
				return parseLocalUser(claims);
			}
			case "RS256" -> {
				if (authMode == AuthMode.LOCAL) {
					throw new JwtValidationException("token_alg_not_allowed");
				}
				verifyCognitoSignature(parts, header);
				validateCognitoClaims(claims);
				return parseCognitoUser(claims);
			}
			default -> throw new JwtValidationException("unsupported_alg");
		}
	}

	/**
	 * Mints a signed access token with subject, role, and expiry claims.
	 */
	public String mintAccessToken(String userId, String role, Instant expiresAt) {
		try {
			String headerJson = objectMapper.writeValueAsString(Map.of("alg", "HS256", "typ", "JWT"));
			String header = BASE64_URL_ENCODER.encodeToString(headerJson.getBytes(StandardCharsets.UTF_8));
			String payloadJson = objectMapper.writeValueAsString(
				Map.of(
					"sub", userId,
					"role", role,
					"iat", clock.instant().getEpochSecond(),
					"exp", expiresAt.getEpochSecond()
				)
			);
			String payload = BASE64_URL_ENCODER.encodeToString(payloadJson.getBytes(StandardCharsets.UTF_8));
			String signingInput = header + "." + payload;
			byte[] sig = hmacSha256(signingInput.getBytes(StandardCharsets.US_ASCII));
			return signingInput + "." + BASE64_URL_ENCODER.encodeToString(sig);
		}
		catch (RuntimeException ex) {
			throw new IllegalStateException("failed to mint jwt", ex);
		}
	}

	/**
	 * Validates the exp claim, if provided, against the current clock.
	 */
	private void validateExp(Map<String, Object> claims) {
		Object exp = claims.get("exp");
		if (exp == null) {
			return;
		}
		long expSeconds = asLong(exp);
		Instant expInstant = Instant.ofEpochSecond(expSeconds);
		if (clock.instant().isAfter(expInstant)) {
			throw new JwtValidationException("token_expired");
		}
	}

	private void verifyHs256Signature(String[] parts) {
		String signingInput = parts[0] + "." + parts[1];
		byte[] expectedSig = hmacSha256(signingInput.getBytes(StandardCharsets.US_ASCII));
		byte[] providedSig = base64UrlDecode(parts[2]);
		if (!MessageDigest.isEqual(expectedSig, providedSig)) {
			throw new JwtValidationException("invalid_signature");
		}
	}

	private AuthenticatedUser parseLocalUser(Map<String, Object> claims) {
		validateExp(claims);
		String sub = asString(claims.get("sub"));
		String roleClaim = asString(claims.get("role"));
		if (sub == null || roleClaim == null) {
			throw new JwtValidationException("missing_required_claims");
		}
		String role = normalizeRole(roleClaim);
		if (role == null) {
			throw new JwtValidationException("invalid_role");
		}
		return new AuthenticatedUser(sub, role);
	}

	private void verifyCognitoSignature(String[] parts, Map<String, Object> header) {
		String kid = asString(header.get("kid"));
		if (kid == null || kid.isBlank()) {
			throw new JwtValidationException("missing_kid");
		}
		RSAPublicKey publicKey = resolvePublicKey(kid);
		String signingInput = parts[0] + "." + parts[1];
		byte[] providedSig = base64UrlDecode(parts[2]);
		try {
			Signature verifier = Signature.getInstance("SHA256withRSA");
			verifier.initVerify(publicKey);
			verifier.update(signingInput.getBytes(StandardCharsets.US_ASCII));
			if (!verifier.verify(providedSig)) {
				throw new JwtValidationException("invalid_signature");
			}
		}
		catch (JwtValidationException ex) {
			throw ex;
		}
		catch (GeneralSecurityException ex) {
			throw new JwtValidationException("signature_verification_failed");
		}
	}

	private void validateCognitoClaims(Map<String, Object> claims) {
		validateExp(claims);
		if (cognitoIssuer.isBlank()) {
			throw new JwtValidationException("cognito_issuer_not_configured");
		}
		String tokenIssuer = asString(claims.get("iss"));
		if (!cognitoIssuer.equals(tokenIssuer)) {
			throw new JwtValidationException("invalid_issuer");
		}
		if (!cognitoAudience.isBlank() && !matchesAudience(claims, cognitoAudience)) {
			throw new JwtValidationException("invalid_audience");
		}
	}

	private AuthenticatedUser parseCognitoUser(Map<String, Object> claims) {
		String sub = asString(claims.get("sub"));
		if (sub == null || sub.isBlank()) {
			throw new JwtValidationException("missing_required_claims");
		}

		String role = roleFromCognitoGroups(claims);
		if (role == null) {
			role = normalizeRole(asString(claims.get("custom:role")));
		}
		if (role == null) {
			role = normalizeRole(asString(claims.get("role")));
		}
		if (role == null) {
			throw new JwtValidationException("invalid_role");
		}
		return new AuthenticatedUser(sub, role);
	}

	private String roleFromCognitoGroups(Map<String, Object> claims) {
		Object groups = claims.get("cognito:groups");
		if (groups instanceof List<?> list) {
			return mapRoleFromGroups(list);
		}
		if (groups instanceof String groupString) {
			String[] split = groupString.split(",");
			List<String> values = java.util.Arrays.stream(split).map(String::trim).toList();
			return mapRoleFromGroups(values);
		}
		return null;
	}

	private String mapRoleFromGroups(List<?> groups) {
		boolean hasAdmin = false;
		boolean hasAgent = false;
		for (Object group : groups) {
			if (!(group instanceof String value)) {
				continue;
			}
			String normalized = value.trim().toUpperCase();
			if ("ADMIN".equals(normalized)) {
				hasAdmin = true;
			}
			if ("AGENT".equals(normalized)) {
				hasAgent = true;
			}
		}
		if (hasAdmin) {
			return "admin";
		}
		if (hasAgent) {
			return "agent";
		}
		return null;
	}

	private boolean matchesAudience(Map<String, Object> claims, String expectedAudience) {
		Object aud = claims.get("aud");
		if (aud instanceof String audValue) {
			return expectedAudience.equals(audValue);
		}
		if (aud instanceof List<?> list) {
			for (Object value : list) {
				if (value instanceof String s && expectedAudience.equals(s)) {
					return true;
				}
			}
		}
		String clientId = asString(claims.get("client_id"));
		return expectedAudience.equals(clientId);
	}

	private RSAPublicKey resolvePublicKey(String kid) {
		CachedJwks cache = jwksCache;
		Instant now = clock.instant();
		if (cache != null && now.isBefore(cache.expiresAt())) {
			RSAPublicKey cachedKey = cache.keysByKid().get(kid);
			if (cachedKey != null) {
				return cachedKey;
			}
		}

		synchronized (this) {
			CachedJwks current = jwksCache;
			Instant refreshedNow = clock.instant();
			if (current != null && refreshedNow.isBefore(current.expiresAt())) {
				RSAPublicKey cachedKey = current.keysByKid().get(kid);
				if (cachedKey != null) {
					return cachedKey;
				}
			}

			CachedJwks loaded = loadJwks();
			jwksCache = loaded;
			RSAPublicKey loadedKey = loaded.keysByKid().get(kid);
			if (loadedKey == null) {
				throw new JwtValidationException("unknown_kid");
			}
			return loadedKey;
		}
	}

	private CachedJwks loadJwks() {
		if (cognitoJwksUrl.isBlank()) {
			throw new JwtValidationException("cognito_jwks_not_configured");
		}
		try {
			HttpRequest request = HttpRequest.newBuilder()
				.uri(URI.create(cognitoJwksUrl))
				.timeout(HTTP_TIMEOUT)
				.GET()
				.build();
			HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
			if (response.statusCode() != 200) {
				throw new JwtValidationException("jwks_fetch_failed");
			}

			Map<String, Object> json = readJson(response.body().getBytes(StandardCharsets.UTF_8));
			Object keysObj = json.get("keys");
			if (!(keysObj instanceof List<?> keys)) {
				throw new JwtValidationException("jwks_invalid_format");
			}

			Map<String, RSAPublicKey> keysByKid = new HashMap<>();
			for (Object keyObj : keys) {
				if (!(keyObj instanceof Map<?, ?> keyMapRaw)) {
					continue;
				}
				String kty = asString(keyMapRaw.get("kty"));
				String kid = asString(keyMapRaw.get("kid"));
				String modulus = asString(keyMapRaw.get("n"));
				String exponent = asString(keyMapRaw.get("e"));
				if (!"RSA".equals(kty) || kid == null || modulus == null || exponent == null) {
					continue;
				}
				keysByKid.put(kid, buildRsaPublicKey(modulus, exponent));
			}

			if (keysByKid.isEmpty()) {
				throw new JwtValidationException("jwks_empty");
			}

			return new CachedJwks(keysByKid, clock.instant().plus(jwksCacheTtl));
		}
		catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
			throw new JwtValidationException("jwks_fetch_failed");
		}
		catch (JwtValidationException ex) {
			throw ex;
		}
		catch (java.io.IOException | RuntimeException ex) {
			throw new JwtValidationException("jwks_fetch_failed");
		}
	}

	private RSAPublicKey buildRsaPublicKey(String modulusBase64Url, String exponentBase64Url) {
		try {
			BigInteger modulus = new BigInteger(1, base64UrlDecode(modulusBase64Url));
			BigInteger exponent = new BigInteger(1, base64UrlDecode(exponentBase64Url));
			RSAPublicKeySpec spec = new RSAPublicKeySpec(modulus, exponent);
			return (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(spec);
		}
		catch (GeneralSecurityException | IllegalArgumentException ex) {
			throw new JwtValidationException("jwks_invalid_key");
		}
	}

	private Map<String, Object> readJson(byte[] bytes) {
		try {
			return objectMapper.readValue(bytes, new TypeReference<>() {});
		}
		catch (RuntimeException ex) {
			throw new JwtValidationException("invalid_json");
		}
	}

	private static byte[] base64UrlDecode(String s) {
		try {
			return BASE64_URL_DECODER.decode(s);
		}
		catch (IllegalArgumentException ex) {
			throw new JwtValidationException("invalid_base64");
		}
	}

	private byte[] hmacSha256(byte[] data) {
		try {
			Mac mac = Mac.getInstance("HmacSHA256");
			mac.init(new SecretKeySpec(secret, "HmacSHA256"));
			return mac.doFinal(data);
		}
		catch (GeneralSecurityException | IllegalArgumentException ex) {
			throw new IllegalStateException("failed to compute hmac", ex);
		}
	}

	private static String asString(Object value) {
		return value instanceof String s ? s : null;
	}

	private static String trim(String value) {
		return value == null ? "" : value.trim();
	}

	private static AuthMode parseAuthMode(String value) {
		return switch (trim(value).toLowerCase()) {
			case "", "local" -> AuthMode.LOCAL;
			case "cognito" -> AuthMode.COGNITO;
			case "hybrid" -> AuthMode.HYBRID;
			default -> throw new IllegalArgumentException("Unsupported app.jwt.auth-mode value: " + value);
		};
	}

	private static String normalizeRole(String value) {
		return switch (value) {
			case "admin", "agent" -> value;
			default -> null;
		};
	}

	private static long asLong(Object value) {
		if (value instanceof Number n) {
			return n.longValue();
		}
		if (value instanceof String s) {
			return Long.parseLong(s);
		}
		throw new JwtValidationException("invalid_number_claim");
	}

	private enum AuthMode {
		LOCAL,
		COGNITO,
		HYBRID
	}

	private record CachedJwks(Map<String, RSAPublicKey> keysByKid, Instant expiresAt) {
	}
}



