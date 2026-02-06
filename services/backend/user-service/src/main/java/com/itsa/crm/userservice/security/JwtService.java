package com.itsa.crm.userservice.security;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * HMAC-SHA256 JWT minting and verification helper.
 */
@Component
public class JwtService {
	private static final Base64.Decoder BASE64_URL_DECODER = Base64.getUrlDecoder();
	private static final Base64.Encoder BASE64_URL_ENCODER = Base64.getUrlEncoder().withoutPadding();

	private final ObjectMapper objectMapper;
	private final Clock clock;
	private final byte[] secret;

	public JwtService(
		ObjectMapper objectMapper,
		Clock clock,
		@Value("${app.jwt.hmac-secret}") String hmacSecret
	) {
		this.objectMapper = objectMapper;
		this.clock = clock;
		this.secret = hmacSecret.getBytes(StandardCharsets.UTF_8);
	}

	/**
	 * Verifies a JWT signature and parses required claims.
	 *
	 * @param token JWT access token
	 * @return authenticated user data
	 * @throws JwtValidationException when the token is invalid or expired
	 */
	public AuthenticatedUser verifyAndParse(String token) {
		String[] parts = token.split("\\.");
		if (parts.length != 3) {
			throw new JwtValidationException("invalid_token_format");
		}

		byte[] headerBytes = base64UrlDecode(parts[0]);
		Map<String, Object> header = readJson(headerBytes);
		Object alg = header.get("alg");
		if (!"HS256".equals(alg)) {
			throw new JwtValidationException("unsupported_alg");
		}

		String signingInput = parts[0] + "." + parts[1];
		byte[] expectedSig = hmacSha256(signingInput.getBytes(StandardCharsets.US_ASCII));
		byte[] providedSig = base64UrlDecode(parts[2]);
		if (!MessageDigest.isEqual(expectedSig, providedSig)) {
			throw new JwtValidationException("invalid_signature");
		}

		Map<String, Object> claims = readJson(base64UrlDecode(parts[1]));
		validateExp(claims);

		String sub = asString(claims.get("sub"));
		String role = asString(claims.get("role"));
		if (sub == null || role == null) {
			throw new JwtValidationException("missing_required_claims");
		}
		if (!"admin".equals(role) && !"agent".equals(role)) {
			throw new JwtValidationException("invalid_role");
		}
		return new AuthenticatedUser(sub, role);
	}

	/**
	 * Mints a signed JWT access token for a user.
	 *
	 * @param userId API user identifier
	 * @param role role for the token subject
	 * @param expiresAt expiration timestamp
	 * @return signed JWT
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
		catch (Exception ex) {
			throw new IllegalStateException("failed to mint jwt", ex);
		}
	}

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

	private Map<String, Object> readJson(byte[] bytes) {
		try {
			return objectMapper.readValue(bytes, new TypeReference<>() {});
		}
		catch (Exception ex) {
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
		catch (Exception ex) {
			throw new IllegalStateException("failed to compute hmac", ex);
		}
	}

	private static String asString(Object value) {
		return value instanceof String s ? s : null;
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
}
