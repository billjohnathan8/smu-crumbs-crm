package com.scroogebank.crm.user_service.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import jakarta.servlet.ServletException;
import java.io.IOException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * Unit tests for {@link RequestIdFilter}.
 */
class RequestIdFilterTest {
	private final RequestIdFilter filter = new RequestIdFilter();

	@Test
	void keepsIncomingRequestIdHeader() throws ServletException, IOException {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.addHeader("X-Request-Id", "req-fixed");
		MockHttpServletResponse response = new MockHttpServletResponse();

		filter.doFilter(request, response, new MockFilterChain());

		assertEquals("req-fixed", request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE));
		assertEquals("req-fixed", response.getHeader("X-Request-Id"));
	}

	@Test
	void generatesRequestIdWhenHeaderMissing() throws ServletException, IOException {
		MockHttpServletRequest request = new MockHttpServletRequest();
		MockHttpServletResponse response = new MockHttpServletResponse();

		filter.doFilter(request, response, new MockFilterChain());

		Object requestId = request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE);
		assertNotNull(requestId);
		assertFalse(requestId.toString().isBlank());
		assertEquals(requestId.toString(), response.getHeader("X-Request-Id"));
	}
}
