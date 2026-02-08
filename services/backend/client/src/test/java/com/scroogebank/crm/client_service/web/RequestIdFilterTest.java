package com.scroogebank.crm.client_service.web;

import static org.assertj.core.api.Assertions.assertThat;

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
	void keepsExistingRequestIdHeader() throws ServletException, IOException {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.addHeader("X-Request-Id", "req-fixed");
		MockHttpServletResponse response = new MockHttpServletResponse();

		filter.doFilter(request, response, new MockFilterChain());

		assertThat(request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE)).isEqualTo("req-fixed");
		assertThat(response.getHeader("X-Request-Id")).isEqualTo("req-fixed");
	}

	@Test
	void generatesRequestIdWhenMissing() throws ServletException, IOException {
		MockHttpServletRequest request = new MockHttpServletRequest();
		MockHttpServletResponse response = new MockHttpServletResponse();

		filter.doFilter(request, response, new MockFilterChain());

		Object requestId = request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE);
		assertThat(requestId).isNotNull();
		assertThat(requestId.toString()).isNotBlank();
		assertThat(response.getHeader("X-Request-Id")).isEqualTo(requestId.toString());
	}

	@Test
	void generatesRequestIdWhenHeaderBlank() throws ServletException, IOException {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.addHeader("X-Request-Id", "   ");
		MockHttpServletResponse response = new MockHttpServletResponse();

		filter.doFilter(request, response, new MockFilterChain());

		Object requestId = request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE);
		assertThat(requestId).isNotNull();
		assertThat(requestId.toString()).isNotBlank();
		assertThat(response.getHeader("X-Request-Id")).isEqualTo(requestId.toString());
	}
}
