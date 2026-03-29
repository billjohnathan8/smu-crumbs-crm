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

	private static final String BASE_URL = "http://localstack:4566/_aws/execute-api/test-api/local";
	private static final String COMM_JSON = """
		{"communicationId":"com_1","clientId":"clt_1","userId":"usr_1","channel":"email","toEmail":"to@example.com","subject":"s","body":"b","status":"queued","retryCount":0,"createdAt":"2026-03-12T05:00:00Z","updatedAt":"2026-03-12T05:00:00Z"}
	""";

	@Test
	void listQueuedCommunications_callsExpectedEndpoint() {
		RestClient.Builder builder = RestClient.builder().baseUrl(BASE_URL);
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		server.expect(requestTo(BASE_URL + "/api/communications/queued?limit=20"))
			.andExpect(method(HttpMethod.GET))
			.andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer x"))
			.andRespond(withSuccess("{\"data\":[" + COMM_JSON.trim() + "]}", org.springframework.http.MediaType.APPLICATION_JSON));

		HttpLogServiceCommunicationClient client = new HttpLogServiceCommunicationClient(builder.build());
		var queued = client.listQueuedCommunications(20, "Bearer x");

		assertThat(queued).hasSize(1);
		assertThat(queued.get(0).communicationId()).isEqualTo("com_1");
		server.verify();
	}

	@Test
	void listQueuedCommunications_nullResponse_returnsEmptyList() {
		RestClient.Builder builder = RestClient.builder().baseUrl(BASE_URL);
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		server.expect(requestTo(BASE_URL + "/api/communications/queued?limit=10"))
			.andExpect(method(HttpMethod.GET))
			.andRespond(withSuccess("null", org.springframework.http.MediaType.APPLICATION_JSON));

		HttpLogServiceCommunicationClient client = new HttpLogServiceCommunicationClient(builder.build());
		var queued = client.listQueuedCommunications(10, "Bearer x");

		assertThat(queued).isEmpty();
		server.verify();
	}

	@Test
	void createCommunication_postsToEndpoint() {
		RestClient.Builder builder = RestClient.builder().baseUrl(BASE_URL);
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		server.expect(requestTo(BASE_URL + "/api/communications"))
			.andExpect(method(HttpMethod.POST))
			.andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer tok"))
			.andRespond(withSuccess(COMM_JSON, org.springframework.http.MediaType.APPLICATION_JSON));

		HttpLogServiceCommunicationClient client = new HttpLogServiceCommunicationClient(builder.build());
		var request = new CreateCommunicationRequest("clt_1", "usr_1", "to@example.com", "s", "b", "email", null);
		CommunicationRecord result = client.createCommunication(request, "Bearer tok");

		assertThat(result.communicationId()).isEqualTo("com_1");
		server.verify();
	}

	@Test
	void updateCommunicationStatus_patchesToEndpoint() {
		RestClient.Builder builder = RestClient.builder().baseUrl(BASE_URL);
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		server.expect(requestTo(BASE_URL + "/api/communications/com_1/status"))
			.andExpect(method(HttpMethod.PATCH))
			.andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer tok"))
			.andRespond(withSuccess(COMM_JSON, org.springframework.http.MediaType.APPLICATION_JSON));

		HttpLogServiceCommunicationClient client = new HttpLogServiceCommunicationClient(builder.build());
		var request = new UpdateCommunicationStatusRequest(CommunicationStatus.sent, "msg-1", null, null, null, null, null);
		CommunicationRecord result = client.updateCommunicationStatus("com_1", request, "Bearer tok");

		assertThat(result.communicationId()).isEqualTo("com_1");
		server.verify();
	}

	@Test
	void updateCommunicationStatusByProviderMessageId_patchesToEndpoint() {
		RestClient.Builder builder = RestClient.builder().baseUrl(BASE_URL);
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		server.expect(requestTo(BASE_URL + "/api/communications/provider/msg-1/status"))
			.andExpect(method(HttpMethod.PATCH))
			.andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer tok"))
			.andRespond(withSuccess(COMM_JSON, org.springframework.http.MediaType.APPLICATION_JSON));

		HttpLogServiceCommunicationClient client = new HttpLogServiceCommunicationClient(builder.build());
		var request = new UpdateCommunicationStatusRequest(CommunicationStatus.failed, null, "bounce", null, null, null, null);
		CommunicationRecord result = client.updateCommunicationStatusByProviderMessageId("msg-1", request, "Bearer tok");

		assertThat(result.communicationId()).isEqualTo("com_1");
		server.verify();
	}
}
