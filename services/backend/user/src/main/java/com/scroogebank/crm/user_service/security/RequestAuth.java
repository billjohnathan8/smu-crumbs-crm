package com.scroogebank.crm.user_service.security;

import com.scroogebank.crm.user_service.dto.UserStatus;
import com.scroogebank.crm.user_service.service.InMemoryUserStore;
import com.scroogebank.crm.user_service.service.UserStore;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;

/**
 * Extracts and validates bearer tokens from incoming requests.
 */
@Component
public class RequestAuth {
	private final JwtService jwtService;
	private final UserStore userStore;

	public RequestAuth(JwtService jwtService, UserStore userStore) {
		this.jwtService = jwtService;
		this.userStore = userStore;
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
		AuthenticatedUser user = jwtService.verifyAndParse(token);
		InMemoryUserStore.UserRecord record;
		try {
			record = userStore.loadRecord(user.userId());
		}
		catch (RuntimeException ex) {
			throw new UnauthorizedException("invalid_bearer_token");
		}
		if (record.status() != UserStatus.active) {
			throw new UnauthorizedException("invalid_bearer_token");
		}
		return user;
	}
}
