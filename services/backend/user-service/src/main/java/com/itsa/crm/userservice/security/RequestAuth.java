package com.itsa.crm.userservice.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;

/**
 * Extracts and validates bearer tokens from incoming requests.
 */
@Component
public class RequestAuth {
	private final JwtService jwtService;

	public RequestAuth(JwtService jwtService) {
		this.jwtService = jwtService;
	}

	/**
	 * Requires a valid bearer token and returns the authenticated user.
	 *
	 * @param request HTTP request containing the Authorization header
	 * @return authenticated user
	 * @throws UnauthorizedException when the bearer token is missing
	 * @throws JwtValidationException when the token is invalid
	 */
	public AuthenticatedUser requireUser(HttpServletRequest request) {
		String header = request.getHeader(HttpHeaders.AUTHORIZATION);
		if (header == null || !header.startsWith("Bearer ")) {
			throw new UnauthorizedException("missing_bearer_token");
		}
		String token = header.substring("Bearer ".length()).trim();
		return jwtService.verifyAndParse(token);
	}
}
