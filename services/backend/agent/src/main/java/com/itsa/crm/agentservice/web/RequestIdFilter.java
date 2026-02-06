package com.itsa.crm.agentservice.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Adds or propagates an X-Request-Id for tracing.
 */
@Component
public class RequestIdFilter extends OncePerRequestFilter {
	public static final String REQUEST_ID_ATTRIBUTE = "requestId";
	private static final String REQUEST_ID_HEADER = "X-Request-Id";

	/**
	 * Ensures every request has a correlation id attached.
	 *
	 * @param request HTTP request
	 * @param response HTTP response
	 * @param filterChain downstream filter chain
	 * @throws ServletException when servlet errors occur
	 * @throws IOException when IO errors occur
	 */
	@Override
	protected void doFilterInternal(
		HttpServletRequest request,
		HttpServletResponse response,
		FilterChain filterChain
	) throws ServletException, IOException {
		String requestId = request.getHeader(REQUEST_ID_HEADER);
		if (requestId == null || requestId.isBlank()) {
			requestId = UUID.randomUUID().toString();
		}
		request.setAttribute(REQUEST_ID_ATTRIBUTE, requestId);
		response.setHeader(REQUEST_ID_HEADER, requestId);
		filterChain.doFilter(request, response);
	}
}
