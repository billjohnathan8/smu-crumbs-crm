package com.scroogebank.crm.client_service.communication;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * Unit tests for {@link HttpLogServiceCommunicationClient}.
 */
class HttpLogServiceCommunicationClientTest {
	@Test
	void listQueuedCommunications_callsExpectedEndpoint() {
		RestClient.Builder builder = RestClient.builder()
			.baseUrl("http://localstack:4566/restapis/test-api/local/_user_request_");
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		server.expect(requestTo("http://localstack:4566/restapis/test-api/local/_user_request_/api/communications/queued?limit=20"))
			.andExpect(method(HttpMethod.GET))
			.andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer x"))
			.andRespond(withSuccess("""
				{"data":[{"communicationId":"com_1","clientId":"clt_1","agentId":"usr_1","channel":"email","toEmail":"to@example.com","subject":"s","body":"b","status":"queued","retryCount":0,"createdAt":"2026-03-12T05:00:00Z","updatedAt":"2026-03-12T05:00:00Z"}]}
			""", org.springframework.http.MediaType.APPLICATION_JSON));

		HttpLogServiceCommunicationClient client = new HttpLogServiceCommunicationClient(builder.build());
		var queued = client.listQueuedCommunications(20, "Bearer x");

		assertThat(queued).hasSize(1);
		assertThat(queued.get(0).communicationId()).isEqualTo("com_1");
		server.verify();
	}
}
