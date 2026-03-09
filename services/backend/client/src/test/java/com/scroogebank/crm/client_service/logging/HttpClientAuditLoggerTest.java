package com.scroogebank.crm.client_service.logging;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * Unit tests for {@link HttpClientAuditLogger}.
 */
class HttpClientAuditLoggerTest {
	@Test
	void logAuditEvent_postsToLogService() {
		RestClient.Builder builder = RestClient.builder().baseUrl("http://log-service");
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		server.expect(requestTo("http://log-service/api/logs"))
			.andExpect(method(HttpMethod.POST))
			.andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer x"))
			.andExpect(content().json("""
				{
				  "action": "CREATE",
				  "attributeName": "Client",
				  "beforeValue": null,
				  "afterValue": "after",
				  "agentId": "usr_1",
				  "clientId": "clt_1",
				  "correlationId": "req-1"
				}
			"""))
			.andRespond(withSuccess());

		HttpClientAuditLogger logger = new HttpClientAuditLogger(builder.build());
		logger.logAuditEvent("CREATE", "Client", null, "after", "usr_1", "clt_1", "req-1", "Bearer x");

		server.verify();
	}
}
