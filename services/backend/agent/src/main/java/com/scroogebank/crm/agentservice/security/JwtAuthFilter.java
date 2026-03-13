package com.scroogebank.crm.agentservice.security;

import java.io.IOException;
import java.util.List;

import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Validates bearer tokens and populates the Spring Security context.
 *
 * <p>Requests without a valid token leave the SecurityContext empty. Spring Security's
 * {@code anyRequest().authenticated()} rule then rejects them with 401.</p>
 */
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

	private final JwtService jwtService;

	public JwtAuthFilter(JwtService jwtService) {
		this.jwtService = jwtService;
	}

	@Override
	protected void doFilterInternal(
		HttpServletRequest request,
		HttpServletResponse response,
		FilterChain filterChain
	) throws ServletException, IOException {
		String header = request.getHeader(HttpHeaders.AUTHORIZATION);
		if (header != null && header.startsWith("Bearer ")) {
			String token = header.substring("Bearer ".length()).trim();
			try {
				AuthenticatedUser user = jwtService.verifyAndParse(token);
				UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
					user,
					null,
					List.of(new SimpleGrantedAuthority("ROLE_" + user.role().toUpperCase()))
				);
				SecurityContextHolder.getContext().setAuthentication(auth);
			} catch (JwtValidationException ignored) {
				// Leave SecurityContext empty; Spring Security rejects with 401
			}
		}
		filterChain.doFilter(request, response);
	}
}
