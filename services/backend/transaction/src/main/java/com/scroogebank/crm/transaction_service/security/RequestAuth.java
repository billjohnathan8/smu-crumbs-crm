package com.scroogebank.crm.transaction_service.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;

/**
 * Helper for extracting and validating bearer tokens from requests.
 */
@Component
public class RequestAuth {
	private final JwtService jwtService;

	public RequestAuth(JwtService jwtService) {
		this.jwtService = jwtService;
	}

	/**
	 * Requires a valid Authorization header and returns the authenticated user.
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



