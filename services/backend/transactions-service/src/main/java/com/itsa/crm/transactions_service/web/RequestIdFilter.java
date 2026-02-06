package com.itsa.crm.transactions_service.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Ensures every request has a request id propagated via header and attribute.
 */
@Component
public class RequestIdFilter extends OncePerRequestFilter {
	public static final String REQUEST_ID_ATTRIBUTE = "requestId";
	private static final String REQUEST_ID_HEADER = "X-Request-Id";

	/**
	 * Adds a request id to both the request attribute and response header.
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


